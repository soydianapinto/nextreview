import { describe, expect, it } from 'vitest'

import { appendQueueItem, createQueueDisplayTitle, createQueueTitle, createRandomUsername, formatQueueCreatedAt, needsGeneratedUsername, openReviewTab, replaceQueueItem, resolveUsername } from './App'

describe('createQueueTitle', () => {
  it('prefers the PR id when available', () => {
    expect(createQueueTitle('pr-123', 'https://github.com/org/repo/pull/1')).toBe('PR: pr-123')
  })

  it('falls back to url when there is no id', () => {
    expect(createQueueTitle('', 'https://github.com/org/repo/pull/1')).toBe('PR: pull / 1')
  })

  it('prefers the human-readable title and falls back to the URL path', () => {
    expect(createQueueDisplayTitle('Fix checkout flow', 'https://github.com/org/repo/pull/123')).toBe('Fix checkout flow')
    expect(createQueueDisplayTitle(undefined, 'https://github.com/org/repo/pull/123')).toBe('repo/pull/123')
  })

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

  it('formats a PR created time for the card', () => {
    expect(formatQueueCreatedAt(0)).toBe('')
    expect(formatQueueCreatedAt(Date.parse('2026-08-30T15:33:00'))).toMatch(/Aug/)
  })

  it('does nothing when a review URL is empty', () => {
    expect(() => openReviewTab('  ')).not.toThrow()
  })

  it('generates Developer N usernames when none is provided', () => {
    expect(needsGeneratedUsername(undefined)).toBe(true)
    expect(needsGeneratedUsername('')).toBe(true)
    expect(needsGeneratedUsername('demo-user')).toBe(true)
    expect(needsGeneratedUsername('user-123')).toBe(true)
    expect(needsGeneratedUsername('Ada')).toBe(false)
    expect(createRandomUsername()).toMatch(/^Developer [1-9]\d{0,2}$/)
    expect(resolveUsername('Ada')).toBe('Ada')
    expect(resolveUsername('  ')).toMatch(/^Developer [1-9]\d{0,2}$/)
  })
})
