import { DatabaseService } from '../services/db'
import type { PullRequest } from '../types'
import {
  consumeLocalPingSuppression,
  shouldNotifyForPing,
  showReviewerPingNotification,
} from '../utils/ping'
import {
  countPendingReviewsFromOthers,
  PR_REMINDER_ALARM,
  resolveReminderInterval,
  shouldClearReminderAlarm,
  syncReminderAlarm,
} from '../utils/reminders'
import { getUserPreferences } from '../utils/storage'

export { PR_REMINDER_ALARM, resolveReminderInterval, shouldClearReminderAlarm, syncReminderAlarm }

const PREFERENCES_STORAGE_KEY = 'nextReview.userPreferences'

export const PING_KEEPALIVE_ALARM = 'pr-ping-keepalive'

const databaseService = new DatabaseService()
let stopPingSubscription: (() => void) | undefined

type StoredPreferences = {
  reminderInterval?: unknown
  isDndActive?: unknown
}

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
  if (alarm.name !== PR_REMINDER_ALARM) {
    return
  }

  const preferences = await getUserPreferences()
  if (preferences?.isDndActive) {
    return
  }

  try {
    const { prs, interactions } = await databaseService.getTeamQueue(preferences?.teamId ?? 'demo-team')
    const pendingCount = countPendingReviewsFromOthers(prs, interactions, preferences?.userId ?? '')

    if (pendingCount === 0) {
      return
    }

    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'Next Review',
      message:
        pendingCount === 1
          ? 'Time to check the queue! You have 1 PR waiting for review.'
          : `Time to check the queue! You have ${pendingCount} PRs waiting for review.`,
    })
  } catch (error) {
    console.error('[Next Review] Reminder alarm failed', error)
  }
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
