import { useEffect, useState } from 'react'

import { DatabaseService } from '../services/db'
import type { PullRequest } from '../types'

export const usePRQueue = (userId: string, teamId: string) => {
  const [queue, setQueue] = useState<PullRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const databaseService = new DatabaseService()
    setIsLoading(true)

    const unsubscribe = databaseService.subscribeToTeamQueue(
      teamId,
      (prs, interactions) => {
        // Build a set of PR IDs that the current user has already reviewed
        const reviewedPrIds = new Set(
          interactions
            .filter((interaction) => interaction.userId === userId && interaction.status === 'REVIEWED')
            .map((interaction) => interaction.prId),
        )

        // Filter out reviewed PRs, keeping only pending ones
        const pendingQueue = prs.filter((pr) => !reviewedPrIds.has(pr.id))

        setQueue(pendingQueue)
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [userId, teamId])

  return { queue, isLoading }
}
