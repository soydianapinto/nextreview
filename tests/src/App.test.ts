import { describe, expect, it } from 'vitest'

import {
  appendQueueItem,
  createQueueDisplayTitle,
  createQueueTitle,
  createRandomUsername,
  filterPendingQueue,
  formatQueueCreatedAt,
  isUsernameTooLong,
  isValidPrUrl,
  listReviewedBy,
  MAX_USERNAME_LENGTH,
  needsGeneratedUsername,
  openReviewTab,
  removeQueueItem,
  replaceQueueItem,
  resolveQueueStatus,
  resolveUsername,
} from '../../src/App'

describe('createQueueTitle', () => {
  it('prefers the PR id when available', () => {
    expect(createQueueTitle('pr-123', 'https://github.com/org/repo/pull/1')).toBe('PR: pr-123')
  })

  it('falls back to url when there is no id', () => {
    expect(createQueueTitle('', 'https://github.com/org/repo/pull/1')).toBe('PR: pull / 1')
  })
})

describe('createQueueDisplayTitle', () => {
  it('prefers the human-readable title and falls back to the URL path', () => {
    expect(createQueueDisplayTitle('Fix checkout flow', 'https://github.com/org/repo/pull/123')).toBe('Fix checkout flow')
    expect(createQueueDisplayTitle(undefined, 'https://github.com/org/repo/pull/123')).toBe('repo/pull/123')
  })
})

describe('queue item helpers', () => {
  it('adds a newly enqueued PR without duplicating it', () => {
    const queue = [{ id: 'pr-1', title: 'PR: pr-1', url: 'https://example.com/pr/1' }]
    const next = appendQueueItem(queue, { id: 'pr-2', title: 'PR: pr-2', url: 'https://example.com/pr/2' })

    expect(next).toHaveLength(2)
    expect(next.map((item) => item.id)).toEqual(['pr-1', 'pr-2'])

    expect(appendQueueItem(next, { id: 'pr-2', title: 'PR: pr-2', url: 'https://example.com/pr/2' })).toHaveLength(2)
  })

  it('replaces an optimistic item with the inserted PR id', () => {
    const optimisticItem = { id: 'temp-1', title: 'PR: pull / 1', url: 'https://example.com/pr/1', status: 'OPEN' as const }
    const insertedItem = { id: 'pr-1', title: 'PR: pr-1', url: optimisticItem.url, status: 'OPEN' as const }

    expect(replaceQueueItem([optimisticItem], optimisticItem.id, insertedItem)).toEqual([insertedItem])
  })

  it('removes a queue item immediately by id', () => {
    const queue = [
      { id: 'pr-1', title: 'PR: pr-1', url: 'https://example.com/pr/1', status: 'OPEN' as const },
      { id: 'pr-2', title: 'PR: pr-2', url: 'https://example.com/pr/2', status: 'OPEN' as const },
    ]

    expect(removeQueueItem(queue, 'pr-1')).toEqual([queue[1]])
  })

  it('formats a PR created time for the card', () => {
    expect(formatQueueCreatedAt(0)).toBe('')
    expect(formatQueueCreatedAt(Date.parse('2026-08-30T15:33:00'))).toMatch(/Aug/)
  })
})

describe('openReviewTab', () => {
  it('does nothing when a review URL is empty', () => {
    expect(() => openReviewTab('  ')).not.toThrow()
  })
})

describe('isValidPrUrl', () => {
  it('accepts http and https PR URLs and rejects everything else', () => {
    expect(isValidPrUrl('https://github.com/org/repo/pull/1')).toBe(true)
    expect(isValidPrUrl(' http://gitlab.com/group/project/-/merge_requests/1 ')).toBe(true)
    expect(isValidPrUrl('')).toBe(false)
    expect(isValidPrUrl('   ')).toBe(false)
    expect(isValidPrUrl('not-a-url')).toBe(false)
    expect(isValidPrUrl('github.com/org/repo/pull/1')).toBe(false)
    expect(isValidPrUrl('ftp://example.com/pr/1')).toBe(false)
    expect(isValidPrUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('username helpers', () => {
  it('generates Developer N usernames when none is provided', () => {
    expect(needsGeneratedUsername(undefined)).toBe(true)
    expect(needsGeneratedUsername('')).toBe(true)
    expect(needsGeneratedUsername('demo-user')).toBe(true)
    expect(needsGeneratedUsername('user-123')).toBe(true)
    expect(needsGeneratedUsername('Ada')).toBe(false)
    expect(createRandomUsername()).toMatch(/^Developer [1-9]\d{0,2}$/)
    expect(resolveUsername('Ada')).toBe('Ada')
    expect(resolveUsername('  Ada  ')).toBe('Ada')
    expect(resolveUsername('  ')).toMatch(/^Developer [1-9]\d{0,2}$/)
  })

  it('rejects usernames longer than the max length after trim', () => {
    const atLimit = 'a'.repeat(MAX_USERNAME_LENGTH)
    const overLimit = 'a'.repeat(MAX_USERNAME_LENGTH + 1)

    expect(isUsernameTooLong(atLimit)).toBe(false)
    expect(isUsernameTooLong(overLimit)).toBe(true)
    expect(isUsernameTooLong(`  ${atLimit}  `)).toBe(false)
    expect(isUsernameTooLong(`  ${overLimit}  `)).toBe(true)
    expect(resolveUsername(overLimit)).toBe(atLimit)
    expect(resolveUsername(`  ${overLimit}  `)).toBe(atLimit)
  })
})

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
