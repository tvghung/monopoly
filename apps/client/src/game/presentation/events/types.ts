import type {
  CardDeck,
  GameCardId,
  GameplaySemanticEvent,
  MoneyEndpoint,
  MoneyTransferReason,
  PassGoSemanticEvent,
  PropertyTransferCause,
} from '@monopoly/shared';

export type PresentationEventType =
  | 'ROLL_DICE'
  | 'MOVE_CHARACTER'
  | 'LAND_TILE'
  | 'BALANCE_CHANGED'
  | 'PROPERTY_OWNERSHIP_CHANGED'
  | 'PROPERTY_DEVELOPMENT_CHANGED'
  | 'JAIL_STATE_CHANGED'
  | 'MONEY_TRANSFER'
  | 'PROPERTY_TRANSFER'
  | 'PASS_GO'
  | 'SENT_TO_JAIL'
  | 'JAIL_ROLL_FAILED'
  | 'JAIL_RELEASED'
  | 'CARD_INTERACTION_CHANGED'
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
  passGo?: PassGoSemanticEvent;
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

export interface MoneyTransferPresentationEvent extends PresentationEventBase {
  type: 'MONEY_TRANSFER';
  source: MoneyEndpoint;
  destination: MoneyEndpoint;
  amount: number;
  reason: MoneyTransferReason;
  operationId?: string;
}

export interface PropertyTransferPresentationEvent extends PresentationEventBase {
  type: 'PROPERTY_TRANSFER';
  transfers: Array<{
    eventId: string;
    tileId: number;
    from: MoneyEndpoint;
    to: MoneyEndpoint;
    fromPlayerId: string | null;
    toPlayerId: string | null;
  }>;
  cause: PropertyTransferCause;
  amount?: number;
  operationId?: string;
}

export interface PassGoPresentationEvent extends PresentationEventBase {
  type: 'PASS_GO';
  event: Extract<GameplaySemanticEvent, { type: 'PASS_GO' }>;
}

export interface SentToJailPresentationEvent extends PresentationEventBase {
  type: 'SENT_TO_JAIL';
  event: Extract<GameplaySemanticEvent, { type: 'SENT_TO_JAIL' }>;
}

export interface JailRollFailedPresentationEvent extends PresentationEventBase {
  type: 'JAIL_ROLL_FAILED';
  playerId: string;
}

export interface JailReleasedPresentationEvent extends PresentationEventBase {
  type: 'JAIL_RELEASED';
  playerId: string;
  cause: Extract<GameplaySemanticEvent, { type: 'JAIL_RELEASED' }>['cause'];
}

export interface CardInteractionChangedPresentationEvent extends PresentationEventBase {
  type: 'CARD_INTERACTION_CHANGED';
  operationId: string;
  playerId: string;
  deck: CardDeck;
  sourceTile: number;
  stage: 'AWAITING_DRAW' | 'REVEALED' | 'CLOSED';
  revealedCardId?: GameCardId;
}

export type PresentationEvent =
  | RollDicePresentationEvent
  | MoveCharacterPresentationEvent
  | LandTilePresentationEvent
  | BalanceChangedPresentationEvent
  | PropertyOwnershipChangedPresentationEvent
  | PropertyDevelopmentChangedPresentationEvent
  | JailStateChangedPresentationEvent
  | MoneyTransferPresentationEvent
  | PropertyTransferPresentationEvent
  | PassGoPresentationEvent
  | SentToJailPresentationEvent
  | JailRollFailedPresentationEvent
  | JailReleasedPresentationEvent
  | CardInteractionChangedPresentationEvent
  | PlayerFinishedPresentationEvent
  | TurnChangedPresentationEvent
  | GameFinishedPresentationEvent;

