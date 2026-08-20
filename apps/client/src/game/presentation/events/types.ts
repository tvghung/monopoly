export type PresentationEventType =
  | 'ROLL_DICE'
  | 'MOVE_CHARACTER'
  | 'LAND_TILE'
  | 'BALANCE_CHANGED'
  | 'PROPERTY_OWNERSHIP_CHANGED'
  | 'PROPERTY_DEVELOPMENT_CHANGED'
  | 'JAIL_STATE_CHANGED'
  | 'PLAYER_FINISHED'
  | 'TURN_CHANGED'
  | 'GAME_FINISHED';

export interface PresentationEventBase {
  id: string;
  roomId: string;
  roomVersion: number;
  type: PresentationEventType;
  entityId: string;
}

export interface RollDicePresentationEvent extends PresentationEventBase {
  type: 'ROLL_DICE';
  entityId: 'room';
  dice1: number;
  dice2: number;
  rollSequence: number;
}

export interface MoveCharacterPresentationEvent extends PresentationEventBase {
  type: 'MOVE_CHARACTER';
  playerId: string;
  from: number;
  to: number;
  steps: number;
  presentation: 'WALK' | 'SNAP';
}

export interface LandTilePresentationEvent extends PresentationEventBase {
  type: 'LAND_TILE';
  playerId: string;
  tileId: number;
}

export interface BalanceChangedPresentationEvent extends PresentationEventBase {
  type: 'BALANCE_CHANGED';
  playerId: string;
  from: number;
  to: number;
}

export interface PropertyOwnershipChangedPresentationEvent extends PresentationEventBase {
  type: 'PROPERTY_OWNERSHIP_CHANGED';
  tileId: number;
  fromPlayerId: string | null;
  toPlayerId: string | null;
}

export interface PropertyDevelopmentChangedPresentationEvent extends PresentationEventBase {
  type: 'PROPERTY_DEVELOPMENT_CHANGED';
  tileId: number;
  playerId: string;
  fromHouses: number;
  toHouses: number;
}

export interface JailStateChangedPresentationEvent extends PresentationEventBase {
  type: 'JAIL_STATE_CHANGED';
  playerId: string;
  isJail: boolean;
}

export interface PlayerFinishedPresentationEvent extends PresentationEventBase {
  type: 'PLAYER_FINISHED';
  playerId: string;
  reason: 'BANKRUPT' | 'LEFT' | null;
}

export interface TurnChangedPresentationEvent extends PresentationEventBase {
  type: 'TURN_CHANGED';
  entityId: 'turn';
  fromPlayerId: string;
  toPlayerId: string;
}

export interface GameFinishedPresentationEvent extends PresentationEventBase {
  type: 'GAME_FINISHED';
  entityId: 'game';
  winnerPlayerId: string | null;
}

export type PresentationEvent =
  | RollDicePresentationEvent
  | MoveCharacterPresentationEvent
  | LandTilePresentationEvent
  | BalanceChangedPresentationEvent
  | PropertyOwnershipChangedPresentationEvent
  | PropertyDevelopmentChangedPresentationEvent
  | JailStateChangedPresentationEvent
  | PlayerFinishedPresentationEvent
  | TurnChangedPresentationEvent
  | GameFinishedPresentationEvent;

