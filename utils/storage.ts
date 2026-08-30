import type { UserPreferences } from '../types'

const STORAGE_KEY = 'nextReview.userPreferences'

export type UserPreferencesStorage = {
  [STORAGE_KEY]: UserPreferences | null
}

const getChromeStorage = () => globalThis.chrome?.storage?.local

const readBrowserPreferences = (): UserPreferences | null => {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UserPreferences) : null
  } catch {
    return null
  }
}

const writeBrowserPreferences = (preferences: UserPreferences) => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Ignore quota or privacy-mode failures; chrome.storage may still succeed.
  }
}

export const getUserPreferences = async (): Promise<UserPreferences | null> => {
  const storage = getChromeStorage()

  if (!storage) {
    return readBrowserPreferences()
  }

  return new Promise((resolve) => {
    storage.get(STORAGE_KEY, (result: UserPreferencesStorage) => {
      resolve(result[STORAGE_KEY] ?? readBrowserPreferences())
    })
  })
}

export const setUserPreferences = async (preferences: UserPreferences): Promise<void> => {
  writeBrowserPreferences(preferences)
  const storage = getChromeStorage()

  if (!storage) {
    return
  }

  return new Promise((resolve, reject) => {
    storage.set({ [STORAGE_KEY]: preferences }, () => {
      const lastError = globalThis.chrome?.runtime?.lastError
      if (lastError) {
        reject(lastError)
        return
      }

      resolve()
    })
  })
}
