import type {
  ActivityEvent,
  CardDeck,
  DiceValue,
  GameCardId,
  MoneyEndpoint,
  MoneyTransferReason,
  PublicRoomState,
} from '@monopoly/shared';
import type { AnimationQueueStatus } from '../queue/types';
import type { TileImpactSignal, TileImpactTiming } from '../../scene/board/motion/tileMotionTypes';

export type CharacterReactionKind = 'happy' | 'sad' | 'jail' | 'bankrupt' | 'emote';

export type CharacterTransition = 'TILE_HOP' | 'JAIL_TRANSFER' | 'SLOT_REFLOW' | 'SNAP' | 'NONE';

export type CharacterMovementPhase = 'START' | 'COMPLETE';

export interface CharacterMovementSignal {
  sequence: number;
  playerId: string;
  transition: Extract<CharacterTransition, 'TILE_HOP' | 'JAIL_TRANSFER' | 'SNAP'>;
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
  consequenceOrder: number;
  playerId: string;
  from: number;
  to: number;
  delta: number;
  durationMs: number;
}

export interface OwnershipChangeSignal {
  id: string;
  sequence: number;
  consequenceOrder: number;
  tileId: number;
  fromPlayerId: string | null;
  toPlayerId: string | null;
  durationMs: number;
}

export interface DevelopmentChangeSignal {
  id: string;
  sequence: number;
  consequenceOrder: number;
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
  consequenceOrder: number;
  playerId: string;
  fromTileId: number;
  toTileId: 0;
  durationMs: number;
}

export interface DestinationPreviewSignal {
  id: string;
  playerId: string;
  tileId: number;
  strongDurationMs: number;
}

export interface MoneyTransferSignal {
  id: string;
  sequence: number;
  source: MoneyEndpoint;
  destination: MoneyEndpoint;
  amount: number;
  reason: MoneyTransferReason;
  coinCount: number;
  durationMs: number;
}

export interface CardPresentationSignal {
  operationId: string;
  playerId: string;
  deck: CardDeck;
  sourceTile: number;
  stage: 'DRAWING' | 'AWAITING_DRAW' | 'REVEALING' | 'REVEALED';
  revealedCardId?: GameCardId;
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
  displayLogs: readonly string[];
  displayActivity: readonly ActivityEvent[];
  displayPositions: Record<string, number>;
  settledPositions: Record<string, number>;
  displayBalances: Record<string, number>;
  displayDevelopmentLevels: Record<number, number>;
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
  destinationPreview: DestinationPreviewSignal | null;
  moneyTransfers: readonly MoneyTransferSignal[];
  cardPresentation: CardPresentationSignal | null;
  animationSpeedMultiplier: number;
  reducedMotion: boolean;
  presentationResetEpoch: number;
}

export type PresentationListener = () => void;

export interface PresentationStoreLike {
  getSnapshot: () => PresentationState;
  subscribe: (listener: PresentationListener) => () => void;
  resetFromSnapshot: (room: PublicRoomState) => void;
  setDisplayLogs: (logs: readonly string[]) => void;
  setDisplayActivity: (events: readonly ActivityEvent[]) => void;
  syncPlayers: (room: PublicRoomState) => void;
  syncDisplayBalances: (
    balances: Readonly<Record<string, number>>,
    delayedChanges?: readonly Pick<BalanceDeltaSignal, 'id' | 'playerId' | 'from' | 'to'>[],
  ) => void;
  syncDisplayDevelopmentLevels: (
    levels: Readonly<Record<number, number | { houses: number }>>,
    delayedChanges?: readonly Pick<DevelopmentChangeSignal, 'tileId' | 'fromHouses' | 'toHouses'>[],
  ) => void;
  startCharacterHop: (playerId: string, fromTileId: number, toTileId: number, durationMs: number) => void;
  startJailTransfer: (playerId: string, fromTileId: number, toTileId: number, durationMs: number) => void;
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
  showDestinationPreview: (signal: DestinationPreviewSignal) => void;
  clearDestinationPreview: (id?: string) => void;
  emitMoneyTransfer: (signal: Omit<MoneyTransferSignal, 'sequence' | 'coinCount'>) => void;
  setCardPresentation: (signal: CardPresentationSignal | null) => void;
  setAnimationSpeedMultiplier: (multiplier: number) => void;
  setReducedMotion: (reducedMotion: boolean) => void;
  setStatus: (status: AnimationQueueStatus) => void;
}

