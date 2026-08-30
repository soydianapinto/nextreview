import type { UserPreferences } from '../types'

const STORAGE_KEY = 'nextReview.userPreferences'

export type UserPreferencesStorage = {
  [STORAGE_KEY]: UserPreferences | null
}

const getChromeStorage = () => globalThis.chrome?.storage?.local

export const getUserPreferences = async (): Promise<UserPreferences | null> => {
  const storage = getChromeStorage()

  if (!storage) {
    return null
  }

  return new Promise((resolve) => {
    storage.get(STORAGE_KEY, (result: UserPreferencesStorage) => {
      resolve(result[STORAGE_KEY] ?? null)
    })
  })
}

export const setUserPreferences = async (preferences: UserPreferences): Promise<void> => {
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
