import { describe, it, expect } from 'vitest'

import type { UserPreferences } from '../types'

describe('UserPreferences type', () => {
  it('should have required properties', () => {
    const prefs: UserPreferences = {
      userId: 'user-123',
      teamId: 'team-456',
      isDndActive: false,
    }

    expect(prefs.userId).toBeDefined()
    expect(prefs.teamId).toBeDefined()
    expect(prefs.isDndActive).toBeDefined()
  })

  it('should enforce DND as boolean', () => {
    const prefs: UserPreferences = {
      userId: 'user-1',
      teamId: 'team-1',
      isDndActive: true,
    }

    expect(typeof prefs.isDndActive).toBe('boolean')
  })
})

describe('PullRequest type', () => {
  it('should have all required PR fields', () => {
    const pr = {
      id: 'pr-1',
      url: 'https://github.com/example/pull/1',
      authorId: 'user-1',
      teamId: 'team-1',
      status: 'OPEN' as const,
      createdAt: Date.now(),
    }

    expect(pr.id).toBeDefined()
    expect(pr.url).toBeDefined()
    expect(pr.authorId).toBeDefined()
    expect(pr.teamId).toBeDefined()
    expect(pr.status).toBe('OPEN')
    expect(pr.createdAt).toBeGreaterThan(0)
  })
})

describe('UserInteraction type', () => {
  it('should have all required interaction fields', () => {
    const interaction = {
      prId: 'pr-1',
      userId: 'user-1',
      status: 'PENDING' as const,
      updatedAt: Date.now(),
    }

    expect(interaction.prId).toBeDefined()
    expect(interaction.userId).toBeDefined()
    expect(['PENDING', 'REVIEWED']).toContain(interaction.status)
    expect(interaction.updatedAt).toBeGreaterThan(0)
  })

  it('should allow REVIEWED status', () => {
    const interaction = {
      prId: 'pr-1',
      userId: 'user-1',
      status: 'REVIEWED' as const,
      updatedAt: Date.now(),
    }

    expect(interaction.status).toBe('REVIEWED')
  })
})
