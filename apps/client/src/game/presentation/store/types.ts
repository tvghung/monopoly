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

export interface BalanceDeltaSignal {
  id: string;
  sequence: number;
  playerId: string;
  from: number;
  to: number;
  delta: number;
  durationMs: number;
}

export interface OwnershipChangeSignal {
  id: string;
  sequence: number;
  tileId: number;
  fromPlayerId: string | null;
  toPlayerId: string | null;
  durationMs: number;
}

export interface DevelopmentChangeSignal {
  id: string;
  sequence: number;
  tileId: number;
  playerId: string;
  fromHouses: number;
  toHouses: number;
  delta: number;
  direction: 'UP' | 'DOWN';
  durationMs: number;
}

export interface GoCrossingSignal {
  id: string;
  sequence: number;
  playerId: string;
  fromTileId: number;
  toTileId: 0;
  durationMs: number;
}

export interface DiceRollPresentation {
  lifecycle: 'rolling';
  dice: DiceValue;
  fromDice?: DiceValue;
  rollSequence: number;
  durationMs: number;
}

export interface PresentationState {
  displayPositions: Record<string, number>;
  settledPositions: Record<string, number>;
  displayActivePlayerId: string | null;
  displayDice: DiceValue;
  displayRollSequence: number;
  diceRoll: DiceRollPresentation | null;
  status: AnimationQueueStatus;
  tileImpacts: readonly TileImpactSignal[];
  characterMovements: readonly CharacterMovementSignal[];
  characterLandings: readonly CharacterLandingSignal[];
  characterReactions: readonly CharacterReactionSignal[];
  balanceDeltas: readonly BalanceDeltaSignal[];
  ownershipChanges: readonly OwnershipChangeSignal[];
  developmentChanges: readonly DevelopmentChangeSignal[];
  goCrossings: readonly GoCrossingSignal[];
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
  startDiceRoll: (dice: DiceValue, rollSequence: number, durationMs: number) => void;
  settleDiceRoll: (dice: DiceValue, rollSequence: number) => void;
  setDisplayDice: (dice: DiceValue, rollSequence: number) => void;
  syncDisplayDice: (dice: DiceValue, rollSequence: number) => void;
  setDisplayActivePlayerId: (playerId: string) => void;
  emitTileImpact: (playerId: string, tileId: number, kind: TileImpactSignal['kind'], timing: TileImpactTiming) => void;
  emitCharacterReaction: (playerId: string, kind: CharacterReactionKind, durationMs: number) => void;
  emitBalanceDelta: (id: string, playerId: string, from: number, to: number, durationMs: number) => void;
  emitOwnershipChange: (
    id: string,
    tileId: number,
    fromPlayerId: string | null,
    toPlayerId: string | null,
    durationMs: number,
  ) => void;
  emitDevelopmentChange: (
    id: string,
    tileId: number,
    playerId: string,
    fromHouses: number,
    toHouses: number,
    durationMs: number,
  ) => void;
  emitGoCrossing: (id: string, playerId: string, fromTileId: number, durationMs: number) => void;
  setAnimationSpeedMultiplier: (multiplier: number) => void;
  setStatus: (status: AnimationQueueStatus) => void;
}

