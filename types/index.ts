export type UserPreferences = {
  userId: string
  teamId: string
}

export type PullRequest = {
  id: string
  url: string
  title?: string
  authorId: string
  teamId: string
  status: 'OPEN' | 'MERGED'
  createdAt: number
}

export type UserInteraction = {
  prId: string
  userId: string
  status: 'PENDING' | 'REVIEWED'
  updatedAt: number
}
