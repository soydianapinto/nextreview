import { useEffect, useMemo, useState } from 'react'

import { DatabaseService } from '../services/db'
import type { PullRequest, UserInteraction, UserPreferences } from '../types'
import { getUserPreferences, setUserPreferences } from '../utils/storage'

type QueueItem = {
  id: string
  title: string
  url: string
  author_id: string
  status: PullRequest['status']
}

const defaultPreferences: UserPreferences = {
  userId: 'demo-user',
  teamId: 'demo-team',
  reminderInterval: 15,
  isDndActive: false,
}

export const createQueueTitle = (id: string, url?: string) => {
  if (id && id.trim().length > 0) {
    return `PR: ${id}`
  }

  if (!url) {
    return 'Review queue item'
  }

  const segments = url.split('/').filter(Boolean)
  const tail = segments.slice(-2)

  if (tail.length === 0) {
    return 'Review queue item'
  }

  return `PR: ${tail.join(' / ')}`
}

export const createQueueDisplayTitle = (title: string | undefined, url: string) => {
  const trimmedTitle = title?.trim()
  if (trimmedTitle) {
    return trimmedTitle
  }

  const segments = url.split('/').filter(Boolean)
  const pathSegments = segments.slice(-3)
  return pathSegments.length > 0 ? pathSegments.join('/') : 'Review queue item'
}

export const filterPendingQueue = (
  prs: PullRequest[],
  interactions: UserInteraction[],
  userId: string,
) => {
  const reviewedPrIds = new Set(
    interactions
      .filter((interaction) => interaction.userId === userId && interaction.status === 'REVIEWED')
      .map((interaction) => interaction.prId),
  )

  return prs.filter((pr) => !reviewedPrIds.has(pr.id))
}

export const appendQueueItem = <T extends { id: string }>(queue: T[], item: T) => {
  const exists = queue.some((existing) => existing.id === item.id)
  if (exists) {
    return queue
  }

  return [...queue, item]
}

export const replaceQueueItem = <T extends { id: string }>(queue: T[], id: string, item: T) =>
  queue.map((existing) => (existing.id === id ? item : existing))

export const removeQueueItem = <T extends { id: string }>(queue: T[], id: string) =>
  queue.filter((existing) => existing.id !== id)

export const openReviewTab = (url: string) => {
  if (!url.trim()) {
    return
  }

  if (globalThis.chrome?.tabs?.create) {
    void globalThis.chrome.tabs.create({ url }).catch((error) => {
      console.error('[Next Review] Failed to open review tab', { url, error })
    })
    return
  }

  globalThis.open?.(url, '_blank')
}

type PingButtonProps = {
  prId: string
  onPing: (prId: string) => Promise<void>
}

function PingButton({ prId, onPing }: PingButtonProps) {
  const [isNotified, setIsNotified] = useState(false)

  const handlePing = async () => {
    try {
      await onPing(prId)
      setIsNotified(true)
      window.setTimeout(() => setIsNotified(false), 2000)
    } catch (error) {
      console.error('[Next Review] Ping action failed', { prId, error })
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handlePing()}
      className="rounded-md border border-amber-500 px-2 py-1 text-xs text-amber-300"
    >
      {isNotified ? '✅ Notified!' : '🔔 Notify Update'}
    </button>
  )
}

const databaseService = new DatabaseService()

function App() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences)
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false)
  const [prUrl, setPrUrl] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [queue, setQueue] = useState<QueueItem[]>([])

  useEffect(() => {
    const loadPreferences = async () => {
      console.info('[Next Review] Loading saved preferences from storage')
      const savedPreferences = await getUserPreferences()

      if (savedPreferences) {
        console.info('[Next Review] Saved preferences loaded', savedPreferences)
        setPreferences({ ...defaultPreferences, ...savedPreferences })
      } else {
        console.info('[Next Review] No saved preferences found, using defaults', defaultPreferences)
      }

      setHasLoadedPreferences(true)
    }

    void loadPreferences()
  }, [])

  useEffect(() => {
    if (!hasLoadedPreferences) {
      return
    }

    console.info('[Next Review] Persisting preferences', preferences)
    void setUserPreferences(preferences)
  }, [hasLoadedPreferences, preferences])

  useEffect(() => {
    console.info('[Next Review] Subscribing to team queue', { teamId: preferences.teamId })

    const unsubscribe = databaseService.subscribeToTeamQueue(
      preferences.teamId,
      (prs, interactions) => {
        const pendingQueue = filterPendingQueue(prs, interactions, preferences.userId)
        const nextQueue = pendingQueue.map((pr) => ({
          id: pr.id,
          title: createQueueDisplayTitle(pr.title, pr.url),
          url: pr.url,
          author_id: pr.authorId,
          status: pr.status,
        }))

        console.info('[Next Review] Queue updated from Supabase', nextQueue)
        setQueue(nextQueue)
      },
      (pr) => {
        if (!preferences.isDndActive && globalThis.chrome?.notifications) {
          void globalThis.chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon-128.png',
            title: 'PR Update Ready!',
            message: pr.title || createQueueDisplayTitle(pr.title, pr.url),
          })
        }
      },
      preferences.userId,
    )

    return unsubscribe
  }, [preferences.teamId, preferences.userId, preferences.isDndActive])

  const canEnqueue = useMemo(() => prUrl.trim().length > 0, [prUrl])

  const enqueuePr = async () => {
    const url = prUrl.trim()
    const title = prTitle.trim()
    if (!url) {
      return
    }

    const optimisticItem: QueueItem = {
      id: `temp-${Date.now()}`,
      title: createQueueDisplayTitle(title, url),
      url,
      author_id: preferences.userId,
      status: 'OPEN',
    }

    setQueue((current) => appendQueueItem(current, optimisticItem))

    console.info('[Next Review] Enqueue button pressed', { url, title, teamId: preferences.teamId, userId: preferences.userId })
    const pr = await databaseService.enqueuePR(url, title, preferences.teamId, preferences.userId)
    const queueItem = {
      id: pr.id,
      title: createQueueDisplayTitle(pr.title, pr.url),
      url: pr.url,
      author_id: pr.authorId,
      status: pr.status,
    }

    setQueue((current) => replaceQueueItem(current, optimisticItem.id, queueItem))
    console.info('[Next Review] Enqueue action complete', { url, prId: pr.id })
    setPrUrl('')
    setPrTitle('')
  }

  const openReview = (url: string) => {
    console.info('[Next Review] Open review clicked', { url })
    openReviewTab(url)
  }

  const triggerPing = (prId: string) => databaseService.triggerPing(prId)

  const deleteQueueItem = async (id: string) => {
    console.info('[Next Review] Delete queue item clicked', { id, userId: preferences.userId })
    const deletedItem = queue.find((item) => item.id === id)
    setQueue((current) => removeQueueItem(current, id))

    try {
      await databaseService.deletePR(id)
      console.info('[Next Review] Delete action complete', { id })
    } catch (error) {
      if (deletedItem) {
        setQueue((current) => appendQueueItem(current, deletedItem))
      }
      console.error('[Next Review] Delete action failed; restored queue item', { id, error })
    }
  }

  const markQueueItemAsReviewed = async (item: QueueItem) => {
    console.info('[Next Review] Mark as reviewed clicked', { prId: item.id, userId: preferences.userId })
    setQueue((current) => removeQueueItem(current, item.id))

    try {
      await databaseService.markAsReviewed(item.id, preferences.userId)
      console.info('[Next Review] Mark as reviewed complete', { prId: item.id })
    } catch (error) {
      setQueue((current) => appendQueueItem(current, item))
      console.error('[Next Review] Mark as reviewed failed; restored queue item', {
        prId: item.id,
        error,
      })
    }
  }

  const renderQueueActions = (item: QueueItem) => {
    return (
      <>
        <button
          type="button"
          onClick={() => openReview(item.url)}
          className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white"
        >
          Review
        </button>
        <button
          type="button"
          onClick={() => void markQueueItemAsReviewed(item)}
          className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white"
        >
          Done Review
        </button>
        <PingButton prId={item.id} onPing={triggerPing} />
        <button
          type="button"
          onClick={() => void deleteQueueItem(item.id)}
          className="rounded-md border border-red-500 px-2 py-1 text-xs text-red-300"
        >
          Delete
        </button>
      </>
    )
  }

  return (
    <main className="w-[360px] bg-slate-950 p-4 text-slate-100">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Next Review</h1>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2">
        <input
          value={prUrl}
          onChange={(event) => setPrUrl(event.target.value)}
          placeholder="Paste your PR/MR URL"
          className="min-w-0 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
        />
        <input
          value={prTitle}
          onChange={(event) => setPrTitle(event.target.value)}
          placeholder="PR/MR Title (optional)"
          className="min-w-0 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
        />
        <button
          type="button"
          onClick={() => void enqueuePr()}
          disabled={!canEnqueue}
          className="col-span-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enqueue
        </button>
      </section>

      <section className="mb-4 rounded-md border border-slate-800 bg-slate-900 p-3">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Settings</h2>
        <label
          htmlFor="dnd-toggle"
          className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-0.5 py-1"
        >
          <span>
            <span className="block text-sm font-medium text-slate-200">Do Not Disturb</span>
            <span className="mt-0.5 block text-xs text-slate-400">
              {preferences.isDndActive ? 'Reminders are paused' : 'Reminders are on'}
            </span>
          </span>
          <span className="relative inline-flex shrink-0 items-center">
            <input
              id="dnd-toggle"
              type="checkbox"
              role="switch"
              aria-checked={preferences.isDndActive}
              checked={preferences.isDndActive}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  isDndActive: event.target.checked,
                }))
              }
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="h-6 w-11 rounded-full bg-slate-700 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-900"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 peer-checked:-translate-y-1/2"
            />
          </span>
        </label>
        <label htmlFor="reminder-interval" className="mt-3 block text-sm text-slate-300">
          Remind me every X mins
        </label>
        <select
          id="reminder-interval"
          value={preferences.reminderInterval}
          onChange={(event) =>
            setPreferences((current) => ({
              ...current,
              reminderInterval: Number(event.target.value),
            }))
          }
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500 focus:ring"
        >
          <option value={10}>10 minutes</option>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>60 minutes</option>
        </select>
      </section>

      <section>
        <ul className="space-y-2">
          {queue.map((item) => (
            <li key={item.id} className="rounded-md border border-slate-800 bg-slate-900 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{item.title}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                    item.status === 'OPEN'
                      ? 'bg-emerald-950 text-emerald-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {renderQueueActions(item)}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
