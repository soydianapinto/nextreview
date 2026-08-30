import { describe, expect, it } from 'vitest'

import { shouldNotifyForPing } from './ping'

describe('shouldNotifyForPing', () => {
  it('notifies teammates who do not have Do Not Disturb on', () => {
    expect(
      shouldNotifyForPing({
        isDndActive: false,
        currentUserId: 'reviewer-1',
        authorId: 'dev-a',
        pingedByCurrentUser: false,
      }),
    ).toBe(true)
  })

  it('does not notify the person who clicked Notify Update', () => {
    expect(
      shouldNotifyForPing({
        isDndActive: false,
        currentUserId: 'reviewer-1',
        authorId: 'dev-a',
        pingedByCurrentUser: true,
      }),
    ).toBe(false)
  })

  it('does not notify the publisher of the PR', () => {
    expect(
      shouldNotifyForPing({
        isDndActive: false,
        currentUserId: 'dev-a',
        authorId: 'dev-a',
        pingedByCurrentUser: false,
      }),
    ).toBe(false)
  })

  it('does not notify when that user has Do Not Disturb on', () => {
    expect(
      shouldNotifyForPing({
        isDndActive: true,
        currentUserId: 'reviewer-1',
        authorId: 'dev-a',
        pingedByCurrentUser: false,
      }),
    ).toBe(false)
  })
})
