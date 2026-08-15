import type { DiceValue, PublicRoomState } from '@monopoly/shared';
import type { AnimationQueueStatus } from '../queue/types';

export interface PresentationState {
  displayPositions: Record<string, number>;
  displayActivePlayerId: string | null;
  displayDice: DiceValue;
  status: AnimationQueueStatus;
}

export type PresentationListener = () => void;

export interface PresentationStoreLike {
  getSnapshot: () => PresentationState;
  subscribe: (listener: PresentationListener) => () => void;
  resetFromSnapshot: (room: PublicRoomState) => void;
  syncPlayers: (room: PublicRoomState) => void;
  setDisplayPosition: (playerId: string, tileId: number) => void;
  setDisplayDice: (dice: DiceValue) => void;
  setDisplayActivePlayerId: (playerId: string) => void;
  setStatus: (status: AnimationQueueStatus) => void;
}

