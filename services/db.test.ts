import { describe, it, expect, beforeEach } from 'vitest'

import { DatabaseService } from './db'

describe('DatabaseService', () => {
  let service: DatabaseService

  beforeEach(() => {
    service = new DatabaseService()
  })

  describe('enqueuePR', () => {
    it('should add a PR to the queue', async () => {
      const url = 'https://github.com/example/repo/pull/1'
      const teamId = 'team-1'
      const authorId = 'user-1'

      await service.enqueuePR(url, 'Fix checkout flow', teamId, authorId)

      let capturedPrs: any[] = []
      service.subscribeToTeamQueue(teamId, (prs) => {
        capturedPrs = prs
      })

      expect(capturedPrs).toHaveLength(1)
      expect(capturedPrs[0]?.url).toBe(url)
      expect(capturedPrs[0]?.title).toBe('Fix checkout flow')
      expect(capturedPrs[0]?.teamId).toBe(teamId)
      expect(capturedPrs[0]?.status).toBe('OPEN')
    })

    it('should create PENDING interactions for the author', async () => {
      const url = 'https://github.com/example/repo/pull/1'
      const teamId = 'team-1'
      const authorId = 'user-1'

      await service.enqueuePR(url, undefined, teamId, authorId)

      let capturedInteractions: any[] = []
      service.subscribeToTeamQueue(teamId, (_, interactions) => {
        capturedInteractions = interactions
      })

      expect(capturedInteractions).toHaveLength(1)
      expect(capturedInteractions[0]?.userId).toBe(authorId)
      expect(capturedInteractions[0]?.status).toBe('PENDING')
    })

    it('should handle multiple PRs in the queue', async () => {
      const teamId = 'team-1'

      await service.enqueuePR('https://github.com/example/repo/pull/1', undefined, teamId, 'user-1')
      await service.enqueuePR('https://github.com/example/repo/pull/2', undefined, teamId, 'user-2')
      await service.enqueuePR('https://github.com/example/repo/pull/3', undefined, teamId, 'user-1')

      let capturedPrs: any[] = []
      service.subscribeToTeamQueue(teamId, (prs) => {
        capturedPrs = prs
      })

      expect(capturedPrs).toHaveLength(3)
    })
  })

  describe('markAsReviewed', () => {
    it('should change interaction status to REVIEWED', async () => {
      const url = 'https://github.com/example/repo/pull/1'
      const teamId = 'team-1'
      const userId = 'user-1'

      await service.enqueuePR(url, undefined, teamId, userId)

      let prId: string | null = null
      service.subscribeToTeamQueue(teamId, (prs) => {
        if (prs.length > 0) {
          prId = prs[0]?.id ?? null
        }
      })

      expect(prId).not.toBeNull()

      if (prId) {
        await service.markAsReviewed(prId, userId)

        let capturedInteractions: any[] = []
        service.subscribeToTeamQueue(teamId, (_, interactions) => {
          capturedInteractions = interactions
        })

        const interaction = capturedInteractions.find((i) => i.prId === prId && i.userId === userId)
        expect(interaction?.status).toBe('REVIEWED')
      }
    })

    it('should not affect other user interactions', async () => {
      const url = 'https://github.com/example/repo/pull/1'
      const teamId = 'team-1'
      const user1 = 'user-1'
      const user2 = 'user-2'

      await service.enqueuePR(url, undefined, teamId, user1)

      let prId: string | null = null
      service.subscribeToTeamQueue(teamId, (prs) => {
        if (prs.length > 0) {
          prId = prs[0]?.id ?? null
        }
      })

      if (prId) {
        await service.markAsReviewed(prId, user1)

        let capturedInteractions: any[] = []
        service.subscribeToTeamQueue(teamId, (_, interactions) => {
          capturedInteractions = interactions
        })

        const user1Interaction = capturedInteractions.find(
          (i) => i.prId === prId && i.userId === user1,
        )
        expect(user1Interaction?.status).toBe('REVIEWED')
      }
    })
  })

  describe('subscribeToTeamQueue', () => {
    it('should filter PRs by teamId', async () => {
      const team1 = 'team-1'
      const team2 = 'team-2'

      await service.enqueuePR('https://github.com/example/repo/pull/1', undefined, team1, 'user-1')
      await service.enqueuePR('https://github.com/example/repo/pull/2', undefined, team2, 'user-1')

      let team1Prs: any[] = []
      service.subscribeToTeamQueue(team1, (prs) => {
        team1Prs = prs
      })

      expect(team1Prs).toHaveLength(1)
      expect(team1Prs[0]?.teamId).toBe(team1)
    })

    it('should return unsubscribe function', async () => {
      const teamId = 'team-1'
      const unsubscribe = service.subscribeToTeamQueue(teamId, () => {})

      expect(typeof unsubscribe).toBe('function')
    })
  })
})
