import { useMemo, useState } from 'react'

type QueueItem = {
  id: number
  title: string
  url: string
}

const initialQueue: QueueItem[] = [
  {
    id: 1,
    title: 'Mock PR: Refactor queue state management',
    url: 'https://github.com/example/repo/pull/101',
  },
  {
    id: 2,
    title: 'Mock PR: Improve CI workflow caching',
    url: 'https://github.com/example/repo/pull/102',
  },
]

function App() {
  const [dndEnabled, setDndEnabled] = useState(false)
  const [prUrl, setPrUrl] = useState('')
  const [queue, setQueue] = useState(initialQueue)

  const canEnqueue = useMemo(() => prUrl.trim().length > 0, [prUrl])

  const enqueuePr = () => {
    const url = prUrl.trim()
    if (!url) {
      return
    }

    setQueue((current) => [
      ...current,
      {
        id: Date.now(),
        title: `Mock PR: ${url.split('/').slice(-2).join(' / ')}`,
        url,
      },
    ])
    setPrUrl('')
  }

  const notifyUpdate = (item: QueueItem) => {
    if (dndEnabled) {
      return
    }

    chrome.runtime.sendMessage({
      action: 'NOTIFY_UPDATE',
      payload: {
        title: 'PR Update Reminder',
        message: `Queue item ready: ${item.title}`,
      },
    })
  }

  const openReview = (url: string) => {
    chrome.tabs.create({ url })
  }

  return (
    <main className="w-[360px] bg-slate-950 p-4 text-slate-100">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Next Review</h1>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>Do Not Disturb</span>
          <button
            type="button"
            role="switch"
            aria-checked={dndEnabled}
            onClick={() => setDndEnabled((value) => !value)}
            className={`relative h-6 w-11 rounded-full transition ${
              dndEnabled ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                dndEnabled ? 'left-5' : 'left-0.5'
              }`}
            />
          </button>
        </label>
      </header>

      <section className="mb-4 flex gap-2">
        <input
          value={prUrl}
          onChange={(event) => setPrUrl(event.target.value)}
          placeholder="Paste PR URL"
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
        />
        <button
          type="button"
          onClick={enqueuePr}
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
              <p className="mb-3 text-sm font-medium">{item.title}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => notifyUpdate(item)}
                  className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200"
                >
                  Notify Update
                </button>
                <button
                  type="button"
                  onClick={() => openReview(item.url)}
                  className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white"
                >
                  Review
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
