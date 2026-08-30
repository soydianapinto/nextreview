import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  handleReminderAlarm,
  initializeReminderAlarm,
  PR_REMINDER_ALARM,
  reminderIntervalFromChanges,
  resolveReminderInterval,
  shouldClearReminderAlarm,
  syncReminderAlarm,
  onStorageChanged,
} from './background'

const mockChrome = {
  storage: {
    local: {
      get: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
  },
  notifications: {
    create: vi.fn(),
  },
}

describe('background reminder scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChrome.alarms.create.mockResolvedValue(undefined)
    mockChrome.alarms.clear.mockResolvedValue(true)
    mockChrome.notifications.create.mockResolvedValue('notification-id')
    vi.stubGlobal('chrome', mockChrome)
  })

  it('treats missing or invalid values as a cleared interval', () => {
    expect(resolveReminderInterval(undefined)).toBeNull()
    expect(resolveReminderInterval(null)).toBeNull()
    expect(resolveReminderInterval('')).toBeNull()
    expect(resolveReminderInterval('abc')).toBeNull()
    expect(resolveReminderInterval(30)).toBe(30)
  })

  it('clears the alarm when the interval is 0 or missing', () => {
    expect(shouldClearReminderAlarm(0)).toBe(true)
    expect(shouldClearReminderAlarm(null)).toBe(true)
    expect(shouldClearReminderAlarm(15)).toBe(false)
  })

  it('reads a top-level reminderInterval change', () => {
    expect(
      reminderIntervalFromChanges({
        reminderInterval: { newValue: 30 },
      }),
    ).toBe(30)
  })

  it('reads reminderInterval from the nested preferences object when it changes', () => {
    expect(
      reminderIntervalFromChanges({
        'nextReview.userPreferences': {
          oldValue: { reminderInterval: 15 },
          newValue: { reminderInterval: 60 },
        },
      }),
    ).toBe(60)
  })

  it('ignores preference writes that do not change reminderInterval', () => {
    expect(
      reminderIntervalFromChanges({
        'nextReview.userPreferences': {
          oldValue: { reminderInterval: 15, isDndActive: false },
          newValue: { reminderInterval: 15, isDndActive: true },
        },
      }),
    ).toBeUndefined()
  })

  it('creates or updates the pr-reminder alarm for a positive interval', async () => {
    await syncReminderAlarm(15)

    expect(mockChrome.alarms.create).toHaveBeenCalledWith(PR_REMINDER_ALARM, {
      periodInMinutes: 15,
    })
    expect(mockChrome.alarms.clear).not.toHaveBeenCalled()
  })

  it('clears the pr-reminder alarm when the interval is 0 or cleared', async () => {
    await syncReminderAlarm(0)
    await syncReminderAlarm(null)

    expect(mockChrome.alarms.clear).toHaveBeenCalledTimes(2)
    expect(mockChrome.alarms.clear).toHaveBeenCalledWith(PR_REMINDER_ALARM)
    expect(mockChrome.alarms.create).not.toHaveBeenCalled()
  })

  it('schedules the alarm when reminderInterval changes in storage', () => {
    onStorageChanged({ reminderInterval: { newValue: 30 } }, 'local')

    expect(mockChrome.alarms.create).toHaveBeenCalledWith(PR_REMINDER_ALARM, {
      periodInMinutes: 30,
    })
  })

  it('ignores storage changes outside chrome.storage.local', () => {
    onStorageChanged({ reminderInterval: { newValue: 30 } }, 'sync')

    expect(mockChrome.alarms.create).not.toHaveBeenCalled()
    expect(mockChrome.alarms.clear).not.toHaveBeenCalled()
  })

  it('restores the alarm from stored preferences on install or startup', async () => {
    mockChrome.storage.local.get.mockResolvedValue({
      'nextReview.userPreferences': { reminderInterval: 15, isDndActive: false },
    })

    await initializeReminderAlarm()

    expect(mockChrome.storage.local.get).toHaveBeenCalledWith([
      'reminderInterval',
      'nextReview.userPreferences',
    ])
    expect(mockChrome.alarms.create).toHaveBeenCalledWith(PR_REMINDER_ALARM, {
      periodInMinutes: 15,
    })
  })

  it('does not notify when Do Not Disturb is active', async () => {
    mockChrome.storage.local.get.mockResolvedValue({
      'nextReview.userPreferences': { isDndActive: true },
    })

    await handleReminderAlarm({ name: PR_REMINDER_ALARM, scheduledTime: Date.now() })

    expect(mockChrome.notifications.create).not.toHaveBeenCalled()
  })

  it('creates a queue reminder notification when Do Not Disturb is off', async () => {
    mockChrome.storage.local.get.mockResolvedValue({
      'nextReview.userPreferences': { isDndActive: false },
    })

    await handleReminderAlarm({ name: PR_REMINDER_ALARM, scheduledTime: Date.now() })

    expect(mockChrome.notifications.create).toHaveBeenCalledWith({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'Next Review',
      message: 'Time to check the queue! You have pending reviews.',
    })
  })

  it('ignores unrelated alarms', async () => {
    await handleReminderAlarm({ name: 'other-alarm', scheduledTime: Date.now() })

    expect(mockChrome.storage.local.get).not.toHaveBeenCalled()
    expect(mockChrome.notifications.create).not.toHaveBeenCalled()
  })
})
