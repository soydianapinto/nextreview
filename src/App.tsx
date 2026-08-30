import { useEffect, useMemo, useState } from 'react'

import { DatabaseService } from '../services/db'
import type { PullRequest, UserInteraction, UserPreferences } from '../types'
import { getUserPreferences, setUserPreferences } from '../utils/storage'

type QueueItem = {
  id: string
  title: string
  url: string
  status: PullRequest['status']
}

const defaultPreferences: UserPreferences = {
  userId: 'demo-user',
  teamId: 'demo-team',
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

const databaseService = new DatabaseService()

function App() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences)
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false)
  const [prUrl, setPrUrl] = useState('')
  const [queue, setQueue] = useState<QueueItem[]>([])

  useEffect(() => {
    const loadPreferences = async () => {
      console.info('[Next Review] Loading saved preferences from storage')
      const savedPreferences = await getUserPreferences()

      if (savedPreferences) {
        console.info('[Next Review] Saved preferences loaded', savedPreferences)
        setPreferences(savedPreferences)
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
          title: createQueueTitle(pr.id, pr.url),
          url: pr.url,
          status: pr.status,
        }))

        console.info('[Next Review] Queue updated from Supabase', nextQueue)
        setQueue(nextQueue)
      },
    )

    return unsubscribe
  }, [preferences.teamId, preferences.userId])

  const canEnqueue = useMemo(() => prUrl.trim().length > 0, [prUrl])

  const enqueuePr = async () => {
    const url = prUrl.trim()
    if (!url) {
      return
    }

    const optimisticItem: QueueItem = {
      id: `temp-${Date.now()}`,
      title: createQueueTitle('', url),
      url,
      status: 'OPEN',
    }

    setQueue((current) => appendQueueItem(current, optimisticItem))

    console.info('[Next Review] Enqueue button pressed', { url, teamId: preferences.teamId, userId: preferences.userId })
    const pr = await databaseService.enqueuePR(url, preferences.teamId, preferences.userId)
    const queueItem = {
      id: pr.id,
      title: createQueueTitle(pr.id, pr.url),
      url: pr.url,
      status: pr.status,
    }

    setQueue((current) => replaceQueueItem(current, optimisticItem.id, queueItem))
    console.info('[Next Review] Enqueue action complete', { url, prId: pr.id })
    setPrUrl('')
  }

  const openReview = (url: string) => {
    console.info('[Next Review] Open review clicked', { url })
    openReviewTab(url)
  }

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

  return (
    <main className="w-[360px] bg-slate-950 p-4 text-slate-100">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Next Review</h1>
      </header>

      <section className="mb-4 flex gap-2">
        <input
          value={prUrl}
          onChange={(event) => setPrUrl(event.target.value)}
          placeholder="Paste your PR/MR URL"
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
        />
        <button
          type="button"
          onClick={() => void enqueuePr()}
          disabled={!canEnqueue}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enqueue
        </button>
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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openReview(item.url)}
                  className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white"
                >
                  Review
                </button>
                <button
                  type="button"
                  onClick={() => void deleteQueueItem(item.id)}
                  className="rounded-md border border-red-500 px-2 py-1 text-xs text-red-300"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
