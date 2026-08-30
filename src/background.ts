import { DatabaseService } from '../services/db'
import type { PullRequest } from '../types'
import {
  consumeLocalPingSuppression,
  shouldNotifyForPing,
  showReviewerPingNotification,
} from '../utils/ping'
import { getUserPreferences } from '../utils/storage'

const PREFERENCES_STORAGE_KEY = 'nextReview.userPreferences'

export const PR_REMINDER_ALARM = 'pr-reminder'
export const PING_KEEPALIVE_ALARM = 'pr-ping-keepalive'

const databaseService = new DatabaseService()
let stopPingSubscription: (() => void) | undefined

type StoredPreferences = {
  reminderInterval?: unknown
  isDndActive?: unknown
}

export const resolveReminderInterval = (value: unknown): number | null => {
  if (value == null || value === '') {
    return null
  }

  const interval = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(interval) ? interval : null
}

export const shouldClearReminderAlarm = (interval: number | null) =>
  interval == null || interval <= 0

const readPreferencesBag = (value: unknown): StoredPreferences | undefined => {
  if (typeof value !== 'object' || value == null) {
    return undefined
  }

  return value as StoredPreferences
}

export const reminderIntervalFromChanges = (
  changes: Record<string, chrome.storage.StorageChange>,
): number | null | undefined => {
  if (changes.reminderInterval) {
    return resolveReminderInterval(changes.reminderInterval.newValue)
  }

  const preferencesChange = changes[PREFERENCES_STORAGE_KEY]
  if (!preferencesChange) {
    return undefined
  }

  const previousInterval = resolveReminderInterval(
    readPreferencesBag(preferencesChange.oldValue)?.reminderInterval,
  )
  const nextInterval = resolveReminderInterval(
    readPreferencesBag(preferencesChange.newValue)?.reminderInterval,
  )

  if (previousInterval === nextInterval) {
    return undefined
  }

  return nextInterval
}

export const syncReminderAlarm = async (interval: number | null) => {
  if (!globalThis.chrome?.alarms) {
    return
  }

  if (interval == null || interval <= 0) {
    await chrome.alarms.clear(PR_REMINDER_ALARM)
    return
  }

  await chrome.alarms.create(PR_REMINDER_ALARM, { periodInMinutes: interval })
}

export const initializeReminderAlarm = async () => {
  if (!globalThis.chrome?.storage?.local) {
    return
  }

  const result = await chrome.storage.local.get(['reminderInterval', PREFERENCES_STORAGE_KEY])
  const storedPreferences = readPreferencesBag(result[PREFERENCES_STORAGE_KEY])
  const interval =
    resolveReminderInterval(result.reminderInterval) ??
    resolveReminderInterval(storedPreferences?.reminderInterval)

  await syncReminderAlarm(interval)
}

export const handleIncomingPing = async (pr: PullRequest) => {
  const preferences = await getUserPreferences()
  const pingedByCurrentUser = await consumeLocalPingSuppression(pr.id)

  if (
    !shouldNotifyForPing({
      isDndActive: preferences?.isDndActive === true,
      currentUserId: preferences?.userId ?? '',
      authorId: pr.authorId,
      pingedByCurrentUser,
    })
  ) {
    return
  }

  showReviewerPingNotification(pr.title ?? '')
}

export const startPingSubscription = async () => {
  stopPingSubscription?.()
  stopPingSubscription = undefined

  const preferences = await getUserPreferences()
  if (!preferences?.teamId) {
    return
  }

  stopPingSubscription = databaseService.subscribeToTeamQueue(
    preferences.teamId,
    () => {},
    (pr) => {
      void handleIncomingPing(pr)
    },
    preferences.userId,
  )
}

export const handleReminderAlarm = async (alarm: chrome.alarms.Alarm) => {
  if (alarm.name !== PR_REMINDER_ALARM || !globalThis.chrome?.storage?.local) {
    return
  }

  const result = await chrome.storage.local.get(['isDndActive', PREFERENCES_STORAGE_KEY])
  const storedPreferences = readPreferencesBag(result[PREFERENCES_STORAGE_KEY])
  const isDndActive = result.isDndActive === true || storedPreferences?.isDndActive === true

  if (isDndActive) {
    return
  }

  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon-128.png',
    title: 'Next Review',
    message: 'Time to check the queue! You have pending reviews.',
  })
}

export const onStorageChanged = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => {
  if (areaName !== 'local') {
    return
  }

  const interval = reminderIntervalFromChanges(changes)
  if (interval !== undefined) {
    void syncReminderAlarm(interval)
  }

  if (changes[PREFERENCES_STORAGE_KEY] || changes.teamId || changes.userId) {
    void startPingSubscription()
  }
}

export const registerBackgroundListeners = () => {
  chrome.storage.onChanged.addListener(onStorageChanged)
  chrome.runtime.onInstalled.addListener(() => {
    void initializeReminderAlarm()
    void chrome.alarms.create(PING_KEEPALIVE_ALARM, { periodInMinutes: 1 })
    void startPingSubscription()
  })
  chrome.runtime.onStartup.addListener(() => {
    void initializeReminderAlarm()
    void chrome.alarms.create(PING_KEEPALIVE_ALARM, { periodInMinutes: 1 })
    void startPingSubscription()
  })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PING_KEEPALIVE_ALARM) {
      void startPingSubscription()
      return
    }

    void handleReminderAlarm(alarm)
  })
}

if (
  globalThis.chrome?.storage?.onChanged &&
  globalThis.chrome.runtime?.onInstalled &&
  globalThis.chrome.runtime?.onStartup &&
  globalThis.chrome.alarms?.onAlarm
) {
  registerBackgroundListeners()
}
