import type { DiceValue, PublicRoomState } from '@monopoly/shared';
import type { AnimationQueueStatus } from '../queue/types';
import type { TileImpactSignal, TileImpactTiming } from '../../scene/board/motion/tileMotionTypes';

export type CharacterReactionKind = 'happy' | 'sad' | 'jail' | 'bankrupt' | 'emote';

export type CharacterTransition = 'TILE_HOP' | 'SLOT_REFLOW' | 'SNAP' | 'NONE';

export type CharacterMovementPhase = 'START' | 'COMPLETE';

export interface CharacterMovementSignal {
  sequence: number;
  playerId: string;
  transition: Extract<CharacterTransition, 'TILE_HOP' | 'SNAP'>;
  phase: CharacterMovementPhase;
  fromTileId: number;
  toTileId: number;
  fromSlotIndex: number;
  fromOccupantCount: number;
  toSlotIndex: number;
  toOccupantCount: number;
  durationMs: number;
}

export interface CharacterLandingSignal {
  sequence: number;
  playerId: string;
  tileId: number;
  durationMs: number;
}

export interface CharacterReactionSignal {
  sequence: number;
  playerId: string;
  kind: CharacterReactionKind;
  durationMs: number;
}

export interface PresentationState {
  displayPositions: Record<string, number>;
  settledPositions: Record<string, number>;
  displayActivePlayerId: string | null;
  displayDice: DiceValue;
  displayRollSequence: number;
  status: AnimationQueueStatus;
  tileImpacts: readonly TileImpactSignal[];
  characterMovements: readonly CharacterMovementSignal[];
  characterLandings: readonly CharacterLandingSignal[];
  characterReactions: readonly CharacterReactionSignal[];
  animationSpeedMultiplier: number;
  presentationResetEpoch: number;
}

export type PresentationListener = () => void;

export interface PresentationStoreLike {
  getSnapshot: () => PresentationState;
  subscribe: (listener: PresentationListener) => () => void;
  resetFromSnapshot: (room: PublicRoomState) => void;
  syncPlayers: (room: PublicRoomState) => void;
  startCharacterHop: (playerId: string, fromTileId: number, toTileId: number, durationMs: number) => void;
  completeCharacterHop: (playerId: string, tileId: number) => void;
  snapDisplayPosition: (playerId: string, tileId: number) => void;
  emitCharacterLanding: (playerId: string, tileId: number, durationMs: number) => void;
  setDisplayDice: (dice: DiceValue, rollSequence: number) => void;
  syncDisplayDice: (dice: DiceValue, rollSequence: number) => void;
  setDisplayActivePlayerId: (playerId: string) => void;
  emitTileImpact: (playerId: string, tileId: number, kind: TileImpactSignal['kind'], timing: TileImpactTiming) => void;
  emitCharacterReaction: (playerId: string, kind: CharacterReactionKind, durationMs: number) => void;
  setAnimationSpeedMultiplier: (multiplier: number) => void;
  setStatus: (status: AnimationQueueStatus) => void;
}

