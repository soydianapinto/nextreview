import type { PullRequest, UserInteraction } from '../types'

export const PR_REMINDER_ALARM = 'pr-reminder'

export const resolveReminderInterval = (value: unknown): number | null => {
  if (value == null || value === '') {
    return null
  }

  const interval = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(interval) ? interval : null
}

export const shouldClearReminderAlarm = (interval: number | null) =>
  interval == null || interval <= 0

export const isOwnPullRequest = (authorId: string, userId: string) => {
  const owner = authorId.trim()
  const currentUser = userId.trim()
  return currentUser.length > 0 && owner.length > 0 && owner === currentUser
}

export const countPendingReviewsFromOthers = (
  prs: PullRequest[],
  interactions: UserInteraction[],
  userId: string,
) => {
  const currentUser = userId.trim()
  if (!currentUser) {
    return 0
  }

  const reviewedByMe = new Set(
    interactions
      .filter((interaction) => interaction.userId === currentUser && interaction.status === 'REVIEWED')
      .map((interaction) => interaction.prId),
  )

  return prs.filter((pr) => {
    if (isOwnPullRequest(pr.authorId, currentUser) || reviewedByMe.has(pr.id)) {
      return false
    }

    const hasReview = interactions.some(
      (interaction) => interaction.prId === pr.id && interaction.status === 'REVIEWED',
    )
    const status = hasReview ? 'REVIEWED' : (pr.lastPingedAt ?? 0) > 0 ? 'NEEDS REVIEW' : pr.status

    return status === 'OPEN' || status === 'NEEDS REVIEW'
  }).length
}

export const syncReminderAlarm = async (interval: number | null) => {
  if (!globalThis.chrome?.alarms) {
    return
  }

  if (interval == null || interval <= 0) {
    await chrome.alarms.clear(PR_REMINDER_ALARM)
    return
  }

  const periodInMinutes = Math.max(1, interval)
  const existing = await chrome.alarms.get(PR_REMINDER_ALARM)
  if (existing?.periodInMinutes === periodInMinutes) {
    return
  }

  await chrome.alarms.create(PR_REMINDER_ALARM, {
    delayInMinutes: periodInMinutes,
    periodInMinutes,
  })
}
