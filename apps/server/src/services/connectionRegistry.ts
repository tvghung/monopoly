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
 * database; this registry only answers which transport currently owns it.
 */
export class ConnectionRegistry {
  private readonly activeByPlayer = new Map<PlayerId, ActiveConnection>();

  private readonly lastGenerationByPlayer = new Map<PlayerId, number>();

  activate(playerId: PlayerId, socketId: string): ActivateConnectionResult {
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
