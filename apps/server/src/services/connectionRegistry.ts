import type { PlayerId } from '@monopoly/shared';

export interface ActiveConnection {
  socketId: string;
  generation: number;
}

export interface ActivateConnectionResult extends ActiveConnection {
  replacedSocketId?: string;
}

/**
 * Process-local connection ownership. Stable player identity lives in the
 * room/session store in the same process; this registry only answers which transport currently owns it.
 */
export class ConnectionRegistry {
  private readonly activeByPlayer = new Map<PlayerId, ActiveConnection>();

  private readonly lastGenerationByPlayer = new Map<PlayerId, number>();

  private nextResumeAttempt = 0;

  private readonly lastBoundResumeByPlayer = new Map<PlayerId, number>();

  /** Capture request order before session processing can yield; failed requests never claim a player. */
  beginResumeAttempt(): number {
    return ++this.nextResumeAttempt;
  }

  activateResume(playerId: PlayerId, socketId: string, attempt: number): ActivateConnectionResult | undefined {
    if (attempt <= (this.lastBoundResumeByPlayer.get(playerId) ?? 0)) return undefined;
    this.lastBoundResumeByPlayer.set(playerId, attempt);
    return this.bind(playerId, socketId);
  }

  activate(playerId: PlayerId, socketId: string): ActivateConnectionResult {
    this.lastBoundResumeByPlayer.set(playerId, this.beginResumeAttempt());
    return this.bind(playerId, socketId);
  }

  private bind(playerId: PlayerId, socketId: string): ActivateConnectionResult {
    const previous = this.activeByPlayer.get(playerId);
    const generation = (this.lastGenerationByPlayer.get(playerId) ?? 0) + 1;
    const active = { socketId, generation };
    this.lastGenerationByPlayer.set(playerId, generation);
    this.activeByPlayer.set(playerId, active);
    return {
      ...active,
      ...(previous && previous.socketId !== socketId
        ? { replacedSocketId: previous.socketId }
        : {}),
    };
  }

  get(playerId: PlayerId): ActiveConnection | undefined {
    return this.activeByPlayer.get(playerId);
  }

  isCurrent(playerId: PlayerId, socketId: string, generation: number): boolean {
    const active = this.activeByPlayer.get(playerId);
    return active?.socketId === socketId && active.generation === generation;
  }

  deactivate(playerId: PlayerId, socketId: string, generation: number): boolean {
    if (!this.isCurrent(playerId, socketId, generation)) return false;
    this.activeByPlayer.delete(playerId);
    return true;
  }

  isConnected(playerId: PlayerId): boolean {
    return this.activeByPlayer.has(playerId);
  }

  clear(): void {
    this.activeByPlayer.clear();
  }
}
