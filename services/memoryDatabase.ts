import type { PullRequest, UserInteraction } from '../types'

import type { DatabaseServiceContract } from './db'

type QueueListener = {
  teamId: string
  callback: (prs: PullRequest[], interactions: UserInteraction[]) => void
  onPing?: (pr: PullRequest) => void
  currentUserId?: string
  lastPingedByPrId: Map<string, number>
  isInitialized: boolean
}

export class MemoryDatabaseService implements DatabaseServiceContract {
  private prs = new Map<string, PullRequest>()
  private interactions = new Map<string, UserInteraction>()
  private listeners = new Set<QueueListener>()
  private sequence = 0

  private interactionKey(prId: string, userId: string) {
    return `${prId}::${userId}`
  }

  private readTeamQueue(teamId: string): { prs: PullRequest[]; interactions: UserInteraction[] } {
    const prs = [...this.prs.values()]
      .filter((pr) => pr.teamId === teamId)
      .map((pr) => ({ ...pr }))
    const prIds = new Set(prs.map((pr) => pr.id))
    const interactions = [...this.interactions.values()]
      .filter((interaction) => prIds.has(interaction.prId))
      .map((interaction) => ({ ...interaction }))

    return { prs, interactions }
  }

  private notifyListener(listener: QueueListener) {
    const { prs, interactions } = this.readTeamQueue(listener.teamId)

    if (listener.isInitialized) {
      prs.forEach((pr) => {
        const lastPingedAt = pr.lastPingedAt ?? 0
        const cachedLastPingedAt = listener.lastPingedByPrId.get(pr.id) ?? 0

        if (lastPingedAt > cachedLastPingedAt && pr.authorId !== listener.currentUserId) {
          listener.onPing?.(pr)
        }

        listener.lastPingedByPrId.set(pr.id, lastPingedAt)
      })
    } else {
      prs.forEach((pr) => {
        listener.lastPingedByPrId.set(pr.id, pr.lastPingedAt ?? 0)
      })
      listener.isInitialized = true
    }

    listener.callback(prs, interactions)
  }

  private notifyTeam(teamId: string) {
    this.listeners.forEach((listener) => {
      if (listener.teamId === teamId) {
        this.notifyListener(listener)
      }
    })
  }

  async enqueuePR(url: string, title: string | undefined, teamId: string, authorId: string): Promise<PullRequest> {
    const pr: PullRequest = {
      id: `pr-${++this.sequence}`,
      url,
      title: title?.trim() || undefined,
      authorId,
      teamId,
      status: 'OPEN',
      createdAt: Date.now(),
    }

    this.prs.set(pr.id, pr)
    this.interactions.set(this.interactionKey(pr.id, authorId), {
      prId: pr.id,
      userId: authorId,
      status: 'PENDING',
      updatedAt: Date.now(),
    })

    this.notifyTeam(teamId)
    return { ...pr }
  }

  async markAsReviewed(prId: string, userId: string): Promise<void> {
    this.interactions.set(this.interactionKey(prId, userId), {
      prId,
      userId,
      status: 'REVIEWED',
      updatedAt: Date.now(),
    })

    const pr = this.prs.get(prId)
    if (pr) {
      this.notifyTeam(pr.teamId)
    }
  }

  async triggerPing(prId: string): Promise<void> {
    const pr = this.prs.get(prId)
    if (!pr) {
      return
    }

    this.prs.set(prId, { ...pr, lastPingedAt: Date.now() })

    this.interactions.forEach((interaction, key) => {
      if (interaction.prId === prId && interaction.status === 'REVIEWED') {
        this.interactions.set(key, {
          ...interaction,
          status: 'PENDING',
          updatedAt: Date.now(),
        })
      }
    })

    this.notifyTeam(pr.teamId)
  }

  async deletePR(prId: string): Promise<void> {
    const pr = this.prs.get(prId)
    this.prs.delete(prId)

    for (const [key, interaction] of this.interactions) {
      if (interaction.prId === prId) {
        this.interactions.delete(key)
      }
    }

    if (pr) {
      this.notifyTeam(pr.teamId)
    }
  }

  async getTeamQueue(teamId: string): Promise<{ prs: PullRequest[]; interactions: UserInteraction[] }> {
    return this.readTeamQueue(teamId)
  }

  subscribeToTeamQueue(
    teamId: string,
    callback: (prs: PullRequest[], interactions: UserInteraction[]) => void,
    onPing?: (pr: PullRequest) => void,
    currentUserId?: string,
  ): () => void {
    const listener: QueueListener = {
      teamId,
      callback,
      onPing,
      currentUserId,
      lastPingedByPrId: new Map(),
      isInitialized: false,
    }

    this.listeners.add(listener)
    this.notifyListener(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }
}
