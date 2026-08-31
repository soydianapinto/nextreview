import type { PullRequest, UserInteraction } from '../types'
import { supabase } from '../utils/supabaseClient'

const mapPrRow = (row: Record<string, unknown>): PullRequest => ({
  id: String(row.id ?? ''),
  url: String(row.url ?? ''),
  title: typeof row.title === 'string' ? row.title : undefined,
  authorId: String(row.author_id ?? row.authorId ?? ''),
  teamId: String(row.team_id ?? row.teamId ?? ''),
  status: (row.status as PullRequest['status']) ?? 'OPEN',
  createdAt: Number(row.created_at ?? row.createdAt ?? 0),
  lastPingedAt: Number(row.last_pinged_at ?? row.lastPingedAt ?? 0),
})

const mapInteractionRow = (row: Record<string, unknown>): UserInteraction => ({
  prId: String(row.pr_id ?? row.prId ?? ''),
  userId: String(row.user_id ?? row.userId ?? ''),
  status: (row.status as UserInteraction['status']) ?? 'PENDING',
  updatedAt: Number(row.updated_at ?? row.updatedAt ?? 0),
})

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

export class DatabaseService implements DatabaseServiceContract {
  async enqueuePR(url: string, title: string | undefined, teamId: string, authorId: string): Promise<PullRequest> {
    try {
      const pr: PullRequest = {
        id: `pr-${Date.now()}`,
        url,
        title: title?.trim() || undefined,
        authorId,
        teamId,
        status: 'OPEN',
        createdAt: Date.now(),
      }

      const prRow = {
        id: pr.id,
        url: pr.url,
        title: pr.title,
        author_id: pr.authorId,
        team_id: pr.teamId,
        status: pr.status,
        created_at: pr.createdAt,
      }

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

      const { error: interactionError } = await supabase
        .from('interactions')
        .insert([interactionRow])

      if (interactionError) {
        console.error('[Next Review] Error inserting interaction into Supabase:', interactionError)
        throw interactionError
      }

      return pr
    } catch (error) {
      console.error('[Next Review] Failed to enqueue PR:', error)
      throw error
    }
  }

  async markAsReviewed(prId: string, userId: string): Promise<void> {
    try {
      const payload = {
        pr_id: prId,
        user_id: userId,
        status: 'REVIEWED' as const,
        updated_at: Date.now(),
      }

      const { error } = await supabase
        .from('interactions')
        .upsert(payload, { onConflict: 'pr_id,user_id' })

      if (error) {
        console.error('[Next Review] Error marking PR as reviewed in Supabase:', error)
        throw error
      }
    } catch (error) {
      console.error('[Next Review] Failed to mark PR as reviewed:', error)
      throw error
    }
  }

  async triggerPing(prId: string): Promise<void> {
    try {
      const { error: pingError } = await supabase
        .from('prs')
        .update({ last_pinged_at: Date.now() })
        .eq('id', prId)

      if (pingError) {
        console.error('[Next Review] Error updating PR ping timestamp:', pingError)
        throw pingError
      }

      const { error: resetError } = await supabase
        .from('interactions')
        .update({ status: 'PENDING', updated_at: Date.now() })
        .eq('pr_id', prId)
        .eq('status', 'REVIEWED')

      if (resetError) {
        console.error('[Next Review] Error resetting reviewed interactions:', resetError)
        throw resetError
      }
    } catch (error) {
      console.error('[Next Review] Failed to trigger ping:', error)
      throw error
    }
  }

  async deletePR(prId: string): Promise<void> {
    try {
      const { error } = await supabase.from('prs').delete().eq('id', prId)

      if (error) {
        console.error('[Next Review] Error deleting PR from Supabase:', error)
        throw error
      }
    } catch (error) {
      console.error('[Next Review] Failed to delete PR:', error)
      throw error
    }
  }

  async getTeamQueue(teamId: string): Promise<{ prs: PullRequest[]; interactions: UserInteraction[] }> {
    const { data: prs, error: prsError } = await supabase
      .from('prs')
      .select('id, url, title, author_id, team_id, status, created_at, last_pinged_at')
      .eq('team_id', teamId)

    if (prsError) {
      console.error('[Next Review] Error fetching PRs from Supabase:', prsError)
      throw prsError
    }

    const mappedPrs = ((prs ?? []) as Record<string, unknown>[]).map(mapPrRow)
    const prIds = mappedPrs.map((pr) => pr.id)

    if (prIds.length === 0) {
      return { prs: [], interactions: [] }
    }

    const { data: interactions, error: interactionsError } = await supabase
      .from('interactions')
      .select('pr_id, user_id, status, updated_at')
      .in('pr_id', prIds)

    if (interactionsError) {
      console.error('[Next Review] Error fetching interactions from Supabase:', interactionsError)
      throw interactionsError
    }

    return {
      prs: mappedPrs,
      interactions: ((interactions ?? []) as Record<string, unknown>[]).map(mapInteractionRow),
    }
  }

  subscribeToTeamQueue(
    teamId: string,
    callback: (prs: PullRequest[], interactions: UserInteraction[]) => void,
    onPing?: (pr: PullRequest) => void,
    currentUserId?: string,
  ): () => void {
    let isSubscribed = true
    const lastPingedByPrId = new Map<string, number>()

    const cachePingTimestamps = (prs: PullRequest[]) => {
      prs.forEach((pr) => {
        lastPingedByPrId.set(pr.id, pr.lastPingedAt ?? 0)
      })
    }

    const processPingUpdates = (prs: PullRequest[]) => {
      prs.forEach((pr) => {
        const lastPingedAt = pr.lastPingedAt ?? 0
        const cachedLastPingedAt = lastPingedByPrId.get(pr.id) ?? 0

        if (
          lastPingedAt > cachedLastPingedAt &&
          pr.authorId !== currentUserId
        ) {
          onPing?.(pr)
        }

        lastPingedByPrId.set(pr.id, lastPingedAt)
      })
    }

    const fetchAndNotify = async () => {
      try {
        const { prs, interactions } = await this.getTeamQueue(teamId)
        cachePingTimestamps(prs)

        if (isSubscribed) {
          callback(prs, interactions)
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
          if (isSubscribed) {
            const incomingPr = mapPrRow((payload.new ?? {}) as Record<string, unknown>)
            if (incomingPr.id) {
              processPingUpdates([incomingPr])
            }
            void fetchAndNotify()
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Next Review] PR realtime subscription failed', { teamId, status })
        }
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
        () => {
          if (isSubscribed) {
            void fetchAndNotify()
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Next Review] Interaction realtime subscription failed', { teamId, status })
        }
      })

    return () => {
      isSubscribed = false
      void supabase.removeChannel(prsSubscription)
      void supabase.removeChannel(interactionsSubscription)
    }
  }
}
