import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  countPendingReviewsFromOthers,
  PR_REMINDER_ALARM,
  syncReminderAlarm,
} from './reminders'

describe('countPendingReviewsFromOthers', () => {
  it('counts other developers OPEN and NEEDS REVIEW cards the user has not reviewed', () => {
    const prs = [
      { id: 'pr-1', url: 'https://example.com/1', authorId: 'dev-a', teamId: 'demo-team', status: 'OPEN' as const, createdAt: 1 },
      { id: 'pr-2', url: 'https://example.com/2', authorId: 'dev-b', teamId: 'demo-team', status: 'OPEN' as const, createdAt: 1, lastPingedAt: 2 },
      { id: 'pr-3', url: 'https://example.com/3', authorId: 'me', teamId: 'demo-team', status: 'OPEN' as const, createdAt: 1 },
      { id: 'pr-4', url: 'https://example.com/4', authorId: 'dev-c', teamId: 'demo-team', status: 'OPEN' as const, createdAt: 1 },
    ]
    const interactions = [
      { prId: 'pr-4', userId: 'me', status: 'REVIEWED' as const, updatedAt: 1 },
    ]

    expect(countPendingReviewsFromOthers(prs, interactions, 'me')).toBe(2)
  })

  it('does not count a queue that only contains the current user PRs', () => {
    const prs = [
      { id: 'pr-1', url: 'https://example.com/1', authorId: 'Developer 4', teamId: 'demo-team', status: 'OPEN' as const, createdAt: 1 },
      { id: 'pr-2', url: 'https://example.com/2', authorId: 'Developer 4', teamId: 'demo-team', status: 'OPEN' as const, createdAt: 1, lastPingedAt: 2 },
    ]

    expect(countPendingReviewsFromOthers(prs, [], 'Developer 4')).toBe(0)
    expect(countPendingReviewsFromOthers(prs, [], ' Developer 4 ')).toBe(0)
  })
})

describe('syncReminderAlarm', () => {
  const mockAlarms = {
    create: vi.fn(),
    clear: vi.fn(),
    get: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAlarms.create.mockResolvedValue(undefined)
    mockAlarms.clear.mockResolvedValue(true)
    mockAlarms.get.mockResolvedValue(undefined)
    vi.stubGlobal('chrome', { alarms: mockAlarms })
  })

  it('schedules the first fire and the repeat period', async () => {
    await syncReminderAlarm(5)

    expect(mockAlarms.create).toHaveBeenCalledWith(PR_REMINDER_ALARM, {
      delayInMinutes: 5,
      periodInMinutes: 5,
    })
  })

  it('does not reset an alarm that already has the same period', async () => {
    mockAlarms.get.mockResolvedValue({ name: PR_REMINDER_ALARM, periodInMinutes: 5 })

    await syncReminderAlarm(5)

    expect(mockAlarms.create).not.toHaveBeenCalled()
  })
})
