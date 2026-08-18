import type { DiceValue, PublicRoomState } from '@monopoly/shared';
import type { AnimationQueueStatus } from '../queue/types';
import type { TileImpactSignal } from '../../scene/board/motion/tileMotionTypes';

export type CharacterReactionKind = 'happy' | 'sad' | 'jail' | 'bankrupt' | 'emote';

export interface CharacterReactionSignal {
  sequence: number;
  playerId: string;
  kind: CharacterReactionKind;
}

export interface PresentationState {
  displayPositions: Record<string, number>;
  settledPositions: Record<string, number>;
  displayActivePlayerId: string | null;
  displayDice: DiceValue;
  status: AnimationQueueStatus;
  tileImpacts: readonly TileImpactSignal[];
  characterReactions: readonly CharacterReactionSignal[];
  presentationResetEpoch: number;
}

export type PresentationListener = () => void;

export interface PresentationStoreLike {
  getSnapshot: () => PresentationState;
  subscribe: (listener: PresentationListener) => () => void;
  resetFromSnapshot: (room: PublicRoomState) => void;
  syncPlayers: (room: PublicRoomState) => void;
  startDisplayPosition: (playerId: string, tileId: number) => void;
  settleDisplayPosition: (playerId: string, tileId: number) => void;
  setDisplayDice: (dice: DiceValue) => void;
  setDisplayActivePlayerId: (playerId: string) => void;
  emitTileImpact: (playerId: string, tileId: number, kind: TileImpactSignal['kind']) => void;
  emitCharacterReaction: (playerId: string, kind: CharacterReactionKind) => void;
  setStatus: (status: AnimationQueueStatus) => void;
}

