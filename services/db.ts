import type { PullRequest, UserInteraction } from '../types'

import { SupabaseDatabaseService } from './supabaseDatabase'

export interface DatabaseServiceContract {
  enqueuePR: (url: string, title: string | undefined, teamId: string, authorId: string) => Promise<PullRequest>
  triggerPing: (prId: string) => Promise<void>
  markAsReviewed: (prId: string, userId: string) => Promise<void>
  deletePR: (prId: string) => Promise<void>
  getTeamQueue: (teamId: string) => Promise<{ prs: PullRequest[]; interactions: UserInteraction[] }>
  subscribeToTeamQueue: (
    teamId: string,
    callback: (prs: PullRequest[], interactions: UserInteraction[]) => void,
    onPing?: (pr: PullRequest) => void,
    currentUserId?: string,
  ) => () => void
}

export { SupabaseDatabaseService as DatabaseService }

export const createDatabaseService = (): DatabaseServiceContract => {
  const provider = import.meta.env.VITE_DATABASE_PROVIDER ?? 'supabase'

  switch (provider) {
    case 'supabase':
      return new SupabaseDatabaseService()
    default:
      throw new Error(
        `[Next Review] Unknown database provider "${provider}". Implement DatabaseServiceContract and register it in createDatabaseService().`,
      )
  }
}
