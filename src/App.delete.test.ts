import { describe, expect, it } from 'vitest'

import { filterPendingQueue, removeQueueItem } from './App'

describe('filterPendingQueue', () => {
  it('hides PRs the current user has already reviewed', () => {
    const prs = [
      { id: 'pr-1', url: 'https://example.com/pr/1', authorId: 'user-1', teamId: 'team-1', status: 'OPEN' as const, createdAt: Date.now() },
      { id: 'pr-2', url: 'https://example.com/pr/2', authorId: 'user-2', teamId: 'team-1', status: 'OPEN' as const, createdAt: Date.now() },
      { id: 'pr-3', url: 'https://example.com/pr/3', authorId: 'user-3', teamId: 'team-1', status: 'OPEN' as const, createdAt: Date.now() },
    ]

    const interactions = [
      { prId: 'pr-1', userId: 'user-1', status: 'REVIEWED' as const, updatedAt: Date.now() },
      { prId: 'pr-2', userId: 'user-1', status: 'PENDING' as const, updatedAt: Date.now() },
      { prId: 'pr-3', userId: 'user-2', status: 'REVIEWED' as const, updatedAt: Date.now() },
    ]

    expect(filterPendingQueue(prs, interactions, 'user-1')).toEqual([
      { id: 'pr-2', url: 'https://example.com/pr/2', authorId: 'user-2', teamId: 'team-1', status: 'OPEN', createdAt: prs[1].createdAt },
      { id: 'pr-3', url: 'https://example.com/pr/3', authorId: 'user-3', teamId: 'team-1', status: 'OPEN', createdAt: prs[2].createdAt },
    ])
  })
})

describe('removeQueueItem', () => {
  it('removes a queue item immediately by id', () => {
    const queue = [
      { id: 'pr-1', title: 'PR: pr-1', url: 'https://example.com/pr/1', status: 'OPEN' as const },
      { id: 'pr-2', title: 'PR: pr-2', url: 'https://example.com/pr/2', status: 'OPEN' as const },
    ]

    expect(removeQueueItem(queue, 'pr-1')).toEqual([queue[1]])
  })
})
