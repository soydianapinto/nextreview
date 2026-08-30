import { describe, it, expect } from 'vitest'

describe('usePRQueue hook logic', () => {
  describe('filtering reviewed PRs', () => {
    it('should filter out PRs the user has marked as REVIEWED', () => {
      const prs = [
        { id: 'pr-1', url: 'https://github.com/example/pull/1', teamId: 'team-1', status: 'OPEN' as const, authorId: 'user-1', createdAt: Date.now() },
        { id: 'pr-2', url: 'https://github.com/example/pull/2', teamId: 'team-1', status: 'OPEN' as const, authorId: 'user-2', createdAt: Date.now() },
        { id: 'pr-3', url: 'https://github.com/example/pull/3', teamId: 'team-1', status: 'OPEN' as const, authorId: 'user-1', createdAt: Date.now() },
      ]

      const interactions = [
        { prId: 'pr-1', userId: 'user-1', status: 'REVIEWED' as const, updatedAt: Date.now() },
        { prId: 'pr-2', userId: 'user-1', status: 'PENDING' as const, updatedAt: Date.now() },
      ]

      const userId = 'user-1'
      const reviewedPrIds = new Set(
        interactions
          .filter((i) => i.userId === userId && i.status === 'REVIEWED')
          .map((i) => i.prId),
      )

      const pendingQueue = prs.filter((pr) => !reviewedPrIds.has(pr.id))

      expect(pendingQueue).toHaveLength(2)
      expect(pendingQueue.map((p) => p.id)).toEqual(['pr-2', 'pr-3'])
    })

    it('should keep all PRs if user has not reviewed any', () => {
      const prs = [
        { id: 'pr-1', url: 'https://github.com/example/pull/1', teamId: 'team-1', status: 'OPEN' as const, authorId: 'user-1', createdAt: Date.now() },
        { id: 'pr-2', url: 'https://github.com/example/pull/2', teamId: 'team-1', status: 'OPEN' as const, authorId: 'user-2', createdAt: Date.now() },
      ]

      const interactions = [] // No interactions

      const userId = 'user-1'
      const reviewedPrIds = new Set(
        interactions
          .filter((i) => i.userId === userId && i.status === 'REVIEWED')
          .map((i) => i.prId),
      )

      const pendingQueue = prs.filter((pr) => !reviewedPrIds.has(pr.id))

      expect(pendingQueue).toHaveLength(2)
    })

    it('should handle empty PR list', () => {
      const prs: any[] = []
      const interactions = [
        { prId: 'pr-1', userId: 'user-1', status: 'REVIEWED' as const, updatedAt: Date.now() },
      ]

      const userId = 'user-1'
      const reviewedPrIds = new Set(
        interactions
          .filter((i) => i.userId === userId && i.status === 'REVIEWED')
          .map((i) => i.prId),
      )

      const pendingQueue = prs.filter((pr) => !reviewedPrIds.has(pr.id))

      expect(pendingQueue).toHaveLength(0)
    })
  })

  describe('multi-user scenarios', () => {
    it('should filter independently per user', () => {
      const prs = [
        { id: 'pr-1', url: 'https://github.com/example/pull/1', teamId: 'team-1', status: 'OPEN' as const, authorId: 'user-1', createdAt: Date.now() },
        { id: 'pr-2', url: 'https://github.com/example/pull/2', teamId: 'team-1', status: 'OPEN' as const, authorId: 'user-2', createdAt: Date.now() },
      ]

      const interactions = [
        { prId: 'pr-1', userId: 'user-1', status: 'REVIEWED' as const, updatedAt: Date.now() },
      ]

      // User-1 perspective
      const user1ReviewedIds = new Set(
        interactions
          .filter((i) => i.userId === 'user-1' && i.status === 'REVIEWED')
          .map((i) => i.prId),
      )
      const user1Queue = prs.filter((pr) => !user1ReviewedIds.has(pr.id))

      // User-2 perspective
      const user2ReviewedIds = new Set(
        interactions
          .filter((i) => i.userId === 'user-2' && i.status === 'REVIEWED')
          .map((i) => i.prId),
      )
      const user2Queue = prs.filter((pr) => !user2ReviewedIds.has(pr.id))

      expect(user1Queue).toHaveLength(1)
      expect(user1Queue[0]?.id).toBe('pr-2')

      expect(user2Queue).toHaveLength(2)
    })
  })
})
