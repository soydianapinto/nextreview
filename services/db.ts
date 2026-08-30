import type { PullRequest, UserInteraction } from '../types'
import { supabase } from '../utils/supabaseClient'

const mapPrRow = (row: Record<string, unknown>): PullRequest => ({
  id: String(row.id ?? ''),
  url: String(row.url ?? ''),
  authorId: String(row.author_id ?? row.authorId ?? ''),
  teamId: String(row.team_id ?? row.teamId ?? ''),
  status: (row.status as PullRequest['status']) ?? 'OPEN',
  createdAt: Number(row.created_at ?? row.createdAt ?? 0),
})

const mapInteractionRow = (row: Record<string, unknown>): UserInteraction => ({
  prId: String(row.pr_id ?? row.prId ?? ''),
  userId: String(row.user_id ?? row.userId ?? ''),
  status: (row.status as UserInteraction['status']) ?? 'PENDING',
  updatedAt: Number(row.updated_at ?? row.updatedAt ?? 0),
})

export interface DatabaseServiceContract {
  enqueuePR: (url: string, teamId: string, authorId: string) => Promise<PullRequest>
  markAsReviewed: (prId: string, userId: string) => Promise<void>
  deletePR: (prId: string) => Promise<void>
  subscribeToTeamQueue: (
    teamId: string,
    callback: (prs: PullRequest[], interactions: UserInteraction[]) => void,
  ) => () => void
}

export class DatabaseService implements DatabaseServiceContract {
  async enqueuePR(url: string, teamId: string, authorId: string): Promise<PullRequest> {
    console.info('[Next Review] enqueuePR called', { url, teamId, authorId })

    try {
      const pr: PullRequest = {
        id: `pr-${Date.now()}`,
        url,
        authorId,
        teamId,
        status: 'OPEN',
        createdAt: Date.now(),
      }

      const prRow = {
        id: pr.id,
        url: pr.url,
        author_id: pr.authorId,
        team_id: pr.teamId,
        status: pr.status,
        created_at: pr.createdAt,
      }

      console.info('[Next Review] Inserting PR into Supabase', prRow)

      const { error: prError } = await supabase.from('prs').insert([prRow])
      if (prError) {
        console.error('[Next Review] Error inserting PR into Supabase:', prError)
        throw prError
      }

      const interaction: UserInteraction = {
        prId: pr.id,
        userId: authorId,
        status: 'PENDING' as const,
        updatedAt: Date.now(),
      }

      const interactionRow = {
        pr_id: interaction.prId,
        user_id: interaction.userId,
        status: interaction.status,
        updated_at: interaction.updatedAt,
      }

      console.info('[Next Review] Inserting interaction into Supabase', interactionRow)

      const { error: interactionError } = await supabase
        .from('interactions')
        .insert([interactionRow])

      if (interactionError) {
        console.error('[Next Review] Error inserting interaction into Supabase:', interactionError)
        throw interactionError
      }

      console.info('[Next Review] enqueuePR succeeded', { prId: pr.id, interaction })
      return pr
    } catch (error) {
      console.error('[Next Review] Failed to enqueue PR:', error)
      throw error
    }
  }

  async markAsReviewed(prId: string, userId: string): Promise<void> {
    console.info('[Next Review] markAsReviewed called', { prId, userId })

    try {
      const payload = {
        pr_id: prId,
        user_id: userId,
        status: 'REVIEWED' as const,
        updated_at: Date.now(),
      }

      console.info('[Next Review] Upserting reviewed interaction', payload)

      const { error } = await supabase
        .from('interactions')
        .upsert(payload, { onConflict: 'pr_id,user_id' })

      if (error) {
        console.error('[Next Review] Error marking PR as reviewed in Supabase:', error)
        throw error
      }

      console.info('[Next Review] markAsReviewed succeeded', { prId, userId })
    } catch (error) {
      console.error('[Next Review] Failed to mark PR as reviewed:', error)
      throw error
    }
  }

  async deletePR(prId: string): Promise<void> {
    console.info('[Next Review] deletePR called', { prId })

    try {
      const { error } = await supabase.from('prs').delete().eq('id', prId)

      if (error) {
        console.error('[Next Review] Error deleting PR from Supabase:', error)
        throw error
      }

      console.info('[Next Review] deletePR succeeded', { prId })
    } catch (error) {
      console.error('[Next Review] Failed to delete PR:', error)
      throw error
    }
  }

  subscribeToTeamQueue(
    teamId: string,
    callback: (prs: PullRequest[], interactions: UserInteraction[]) => void,
  ): () => void {
    console.info('[Next Review] subscribeToTeamQueue started', { teamId })
    let isSubscribed = true

    const fetchAndNotify = async () => {
      console.info('[Next Review] Fetching team queue from Supabase', { teamId })

      try {
        const { data: prs, error: prsError } = await supabase
          .from('prs')
          .select('id, url, author_id, team_id, status, created_at')
          .eq('team_id', teamId)

        if (prsError) {
          console.error('[Next Review] Error fetching PRs from Supabase:', prsError)
          return
        }

        const mappedPrs = ((prs ?? []) as Record<string, unknown>[]).map(mapPrRow)
        const prIds = mappedPrs.map((pr) => pr.id)
        console.info('[Next Review] PRs fetched for team', { teamId, count: prIds.length, prIds })

        if (prIds.length === 0) {
          if (isSubscribed) {
            console.info('[Next Review] No PRs found for team, notifying empty queue', { teamId })
            callback([], [])
          }
          return
        }

        const { data: interactions, error: interactionsError } = await supabase
          .from('interactions')
          .select('pr_id, user_id, status, updated_at')
          .in('pr_id', prIds)

        if (interactionsError) {
          console.error('[Next Review] Error fetching interactions from Supabase:', interactionsError)
          return
        }

        const safePrs = mappedPrs || []
        const safeInteractions = ((interactions ?? []) as Record<string, unknown>[]).map(mapInteractionRow)

        console.info('[Next Review] Team queue data ready', {
          teamId,
          prs: safePrs,
          interactions: safeInteractions,
        })

        if (isSubscribed) {
          callback(safePrs, safeInteractions)
        }
      } catch (error) {
        console.error('[Next Review] Failed to fetch team queue:', error)
      }
    }

    void fetchAndNotify()

    const prsSubscription = supabase
      .channel(`prs-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prs',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          console.info('[Next Review] PR realtime event received', { teamId, payload })
          if (isSubscribed) {
            void fetchAndNotify()
          }
        },
      )
      .subscribe((status) => {
        console.info('[Next Review] PR realtime subscription status', { teamId, status })
      })

    const interactionsSubscription = supabase
      .channel(`interactions-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interactions',
        },
        (payload) => {
          console.info('[Next Review] Interaction realtime event received', { teamId, payload })
          if (isSubscribed) {
            void fetchAndNotify()
          }
        },
      )
      .subscribe((status) => {
        console.info('[Next Review] Interaction realtime subscription status', { teamId, status })
      })

    return () => {
      isSubscribed = false
      console.info('[Next Review] Unsubscribing from team queue', { teamId })
      void supabase.removeChannel(prsSubscription)
      void supabase.removeChannel(interactionsSubscription)
    }
  }
}
