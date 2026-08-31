import { describe, expect, it } from 'vitest'

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

      const pendingQueue = prs.filter((pr) => {
        if (pr.authorId === userId) {
          return true
        }

        return !reviewedPrIds.has(pr.id)
      })

      expect(pendingQueue).toHaveLength(3)
      expect(pendingQueue.map((p) => p.id)).toEqual(['pr-1', 'pr-2', 'pr-3'])
    })

    it('should keep all PRs if user has not reviewed any', () => {
      const prs = [
        { id: 'pr-1', url: 'https://github.com/example/pull/1', teamId: 'team-1', status: 'OPEN' as const, authorId: 'user-1', createdAt: Date.now() },
        { id: 'pr-2', url: 'https://github.com/example/pull/2', teamId: 'team-1', status: 'OPEN' as const, authorId: 'user-2', createdAt: Date.now() },
      ]

      const interactions: { prId: string; userId: string; status: 'REVIEWED' | 'PENDING'; updatedAt: number }[] = []

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
      const prs: { id: string }[] = []
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

      const user1ReviewedIds = new Set(
        interactions
          .filter((i) => i.userId === 'user-1' && i.status === 'REVIEWED')
          .map((i) => i.prId),
      )
      const user1Queue = prs.filter((pr) => {
        if (pr.authorId === 'user-1') {
          return true
        }

        return !user1ReviewedIds.has(pr.id)
      })

      const user2ReviewedIds = new Set(
        interactions
          .filter((i) => i.userId === 'user-2' && i.status === 'REVIEWED')
          .map((i) => i.prId),
      )
      const user2Queue = prs.filter((pr) => {
        if (pr.authorId === 'user-2') {
          return true
        }

        return !user2ReviewedIds.has(pr.id)
      })

      expect(user1Queue).toHaveLength(2)
      expect(user1Queue.map((pr) => pr.id)).toEqual(['pr-1', 'pr-2'])

      expect(user2Queue).toHaveLength(2)
    })
  })
})
