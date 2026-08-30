export type UserPreferences = {
  userId: string
  teamId: string
  reminderInterval: number
  isDndActive: boolean
}

export type PullRequest = {
  id: string
  url: string
  title?: string
  authorId: string
  teamId: string
  status: 'OPEN' | 'MERGED'
  createdAt: number
  lastPingedAt?: number
}

export type UserInteraction = {
  prId: string
  userId: string
  status: 'PENDING' | 'REVIEWED'
  updatedAt: number
}
