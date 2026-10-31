import type {
  GameState, PlayerId, PowerUpDefinition, PowerUpInstance, PowerUpRewardOffer,
} from '@monopoly/shared';

export type PowerUpTarget = { kind: 'PLAYER'; playerId: PlayerId } | { kind: 'TILE'; tileID: number };
export interface PowerUpEffectContext {
  state: GameState; // The caller's authoritative transaction draft, never a client snapshot.
  actorPlayerId: PlayerId;
  instance: PowerUpInstance;
  definition: PowerUpDefinition;
  targets: readonly PowerUpTarget[];
}
export interface PowerUpTargetResolver {
  resolve(context: Omit<PowerUpEffectContext, 'targets'>): readonly PowerUpTarget[];
}
export interface PowerUpEffectEngine {
  validate(context: PowerUpEffectContext): { ok: true } | { ok: false; reason: string };
  apply(context: PowerUpEffectContext): void;
}
export interface PowerUpDurationManager {
  onTurnCompleted(state: GameState, playerId: PlayerId): void;
  onPlayerRemoved(state: GameState, playerId: PlayerId): void;
}
/** Required before live reward/turn gating can be wired; never defaults to a random selection. */
export interface PowerUpDisconnectPolicy {
  onRecoveryExpired(state: GameState, offer: Readonly<PowerUpRewardOffer>): void;
}
