import { describe, expect, it } from 'vitest'

import { filterPendingQueue, listReviewedBy, removeQueueItem, resolveQueueStatus } from './App'

describe('filterPendingQueue', () => {
  it('hides reviewed PRs from reviewers but keeps them for the publisher', () => {
    const prs = [
      { id: 'pr-1', url: 'https://example.com/pr/1', authorId: 'user-1', teamId: 'team-1', status: 'OPEN' as const, createdAt: Date.now() },
      { id: 'pr-2', url: 'https://example.com/pr/2', authorId: 'user-2', teamId: 'team-1', status: 'OPEN' as const, createdAt: Date.now() },
      { id: 'pr-3', url: 'https://example.com/pr/3', authorId: 'user-3', teamId: 'team-1', status: 'OPEN' as const, createdAt: Date.now() },
    ]

    const interactions = [
      { prId: 'pr-1', userId: 'user-2', status: 'REVIEWED' as const, updatedAt: Date.now() },
      { prId: 'pr-2', userId: 'user-1', status: 'PENDING' as const, updatedAt: Date.now() },
      { prId: 'pr-3', userId: 'user-2', status: 'REVIEWED' as const, updatedAt: Date.now() },
    ]

    expect(filterPendingQueue(prs, interactions, 'user-1')).toEqual(prs)
    expect(filterPendingQueue(prs, interactions, 'user-2').map((pr) => pr.id)).toEqual(['pr-2'])
  })

  it('keeps a publisher card after the publisher also marks it reviewed', () => {
    const prs = [
      { id: 'pr-1', url: 'https://example.com/pr/1', authorId: 'user-1', teamId: 'team-1', status: 'OPEN' as const, createdAt: Date.now() },
    ]
    const interactions = [
      { prId: 'pr-1', userId: 'user-1', status: 'REVIEWED' as const, updatedAt: Date.now() },
    ]

    expect(filterPendingQueue(prs, interactions, 'user-1')).toEqual(prs)
  })
})

describe('resolveQueueStatus', () => {
  it('shows REVIEWED after a reviewer finishes, then NEEDS REVIEW after a ping', () => {
    const pr = {
      id: 'pr-1',
      url: 'https://example.com/pr/1',
      authorId: 'user-1',
      teamId: 'team-1',
      status: 'OPEN' as const,
      createdAt: Date.now(),
    }

    expect(resolveQueueStatus(pr, [])).toBe('OPEN')
    expect(
      resolveQueueStatus(pr, [{ prId: 'pr-1', userId: 'user-2', status: 'REVIEWED', updatedAt: Date.now() }]),
    ).toBe('REVIEWED')
    expect(
      resolveQueueStatus(
        { ...pr, lastPingedAt: Date.now() },
        [{ prId: 'pr-1', userId: 'user-2', status: 'PENDING', updatedAt: Date.now() }],
      ),
    ).toBe('NEEDS REVIEW')
  })
})

describe('listReviewedBy', () => {
  it('lists unique reviewer usernames and ignores the publisher', () => {
    const pr = {
      id: 'pr-1',
      url: 'https://example.com/pr/1',
      authorId: 'Developer 1',
      teamId: 'team-1',
      status: 'OPEN' as const,
      createdAt: Date.now(),
    }

    expect(
      listReviewedBy(pr, [
        { prId: 'pr-1', userId: 'Developer 2', status: 'REVIEWED', updatedAt: Date.now() },
        { prId: 'pr-1', userId: 'Developer 3', status: 'REVIEWED', updatedAt: Date.now() },
        { prId: 'pr-1', userId: 'Developer 2', status: 'REVIEWED', updatedAt: Date.now() },
        { prId: 'pr-1', userId: 'Developer 1', status: 'REVIEWED', updatedAt: Date.now() },
        { prId: 'pr-1', userId: 'Developer 4', status: 'PENDING', updatedAt: Date.now() },
        { prId: 'pr-2', userId: 'Developer 5', status: 'REVIEWED', updatedAt: Date.now() },
      ]),
    ).toEqual(['Developer 2', 'Developer 3'])
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
