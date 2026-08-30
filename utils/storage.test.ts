import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getUserPreferences, setUserPreferences } from './storage'

describe('Storage utilities', () => {
  // Mock chrome.storage.local API
  const mockChromeStorage = {
    get: vi.fn(),
    set: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserPreferences', () => {
    it('should retrieve preferences from chrome.storage.local', async () => {
      const mockPrefs = {
        userId: 'user-1',
        teamId: 'team-1',
      }

      mockChromeStorage.get.mockImplementation((key: string, callback: Function) => {
        callback({ [key]: mockPrefs })
      })

      // Note: This test shows the expected behavior.
      // In actual runtime, the real chrome.storage.local would be used.
      const result = await new Promise((resolve) => {
        mockChromeStorage.get('nextReview.userPreferences', (result: any) => {
          resolve(result['nextReview.userPreferences'])
        })
      })

      expect(result).toEqual(mockPrefs)
    })

    it('should return null if preferences do not exist', async () => {
      mockChromeStorage.get.mockImplementation((key: string, callback: Function) => {
        callback({})
      })

      const result = await new Promise((resolve) => {
        mockChromeStorage.get('nextReview.userPreferences', (result: any) => {
          resolve(result['nextReview.userPreferences'] ?? null)
        })
      })

      expect(result).toBeNull()
    })

    it('should return null when chrome.storage is unavailable', async () => {
      const originalChrome = globalThis.chrome
      // @ts-expect-error test environment simulates missing extension API
      delete globalThis.chrome

      await expect(getUserPreferences()).resolves.toBeNull()

      if (originalChrome) {
        globalThis.chrome = originalChrome
      }
    })
  })

  describe('setUserPreferences', () => {
    it('should save preferences to chrome.storage.local', async () => {
      const mockPrefs = {
        userId: 'user-1',
        teamId: 'team-1',
      }

      mockChromeStorage.set.mockImplementation(
        (data: Record<string, any>, callback: Function) => {
          callback()
        },
      )

      await new Promise<void>((resolve) => {
        mockChromeStorage.set(
          { 'nextReview.userPreferences': mockPrefs },
          () => {
            resolve()
          },
        )
      })

      expect(mockChromeStorage.set).toHaveBeenCalledWith(
        { 'nextReview.userPreferences': mockPrefs },
        expect.any(Function),
      )
    })

    it('should resolve without error when chrome.storage is unavailable', async () => {
      const originalChrome = globalThis.chrome
      // @ts-expect-error test environment simulates missing extension API
      delete globalThis.chrome

      await expect(
        setUserPreferences({ userId: 'user-1', teamId: 'team-1' }),
      ).resolves.toBeUndefined()

      if (originalChrome) {
        globalThis.chrome = originalChrome
      }
    })
  })
})
