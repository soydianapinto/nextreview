const SUPPRESSED_PING_KEY = 'nextReview.suppressedPing'
const SUPPRESSION_WINDOW_MS = 8000

type SuppressedPing = {
  prId: string
  at: number
}

const getSessionStorage = () =>
  globalThis.chrome?.storage?.session ?? globalThis.chrome?.storage?.local

export const shouldNotifyForPing = ({
  isDndActive,
  currentUserId,
  authorId,
  pingedByCurrentUser,
}: {
  isDndActive: boolean
  currentUserId: string
  authorId: string
  pingedByCurrentUser: boolean
}) => {
  if (isDndActive || pingedByCurrentUser) {
    return false
  }

  if (authorId && authorId === currentUserId) {
    return false
  }

  return true
}

export const suppressLocalPingNotification = async (prId: string) => {
  const storage = getSessionStorage()
  if (!storage?.set) {
    return
  }

  await storage.set({
    [SUPPRESSED_PING_KEY]: { prId, at: Date.now() } satisfies SuppressedPing,
  })
}

export const consumeLocalPingSuppression = async (prId: string) => {
  const storage = getSessionStorage()
  if (!storage?.get) {
    return false
  }

  const result = (await storage.get(SUPPRESSED_PING_KEY)) as {
    [SUPPRESSED_PING_KEY]?: SuppressedPing
  }
  const suppressed = result[SUPPRESSED_PING_KEY]

  if (!suppressed || suppressed.prId !== prId) {
    return false
  }

  if (Date.now() - suppressed.at > SUPPRESSION_WINDOW_MS) {
    return false
  }

  await storage.remove?.(SUPPRESSED_PING_KEY)
  return true
}

export const showReviewerPingNotification = (title: string) => {
  const message = title.trim() || 'You have a pull request ready for another look.'

  if (!globalThis.chrome?.notifications?.create) {
    return
  }

  void globalThis.chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon-128.png',
    title: 'PR Update Ready!',
    message,
  })
}
