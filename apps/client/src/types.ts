import type { Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  OfferId,
  OfferInfo,
  PrivatePlayerState,
  PrivateOffer,
  PublicGameState,
  RoomPlayerMeta,
  RoomRole,
  RoomStatus,
  ServerToClientEvents,
} from '@monopoly/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type DevelopmentRequest = Parameters<ClientToServerEvents['resolve development']>[0];

export interface SocketFunctions {
  rollDice: () => Promise<Ack>;
  buyProperty: (operationId: string) => void | Promise<Ack>;
  doNotBuy?: (operationId: string) => void | Promise<Ack>;
  resolveDevelopment?: (request: DevelopmentRequest) => void | Promise<Ack>;
  dismissCard?: (operationId: string) => void | Promise<Ack>;
  waitInJail?: () => void | Promise<Ack>;
  sendChat: (message: string) => void;
  makeOffer: (offerInfo: OfferInfo) => void;
  acceptOffer: (offerId: OfferId) => void;
  declineOffer: (offerId: OfferId) => void;
  sellHouse: (tileID: number) => void;
  payBail: () => void | Promise<Ack>;
  useJailCard: () => void | Promise<Ack>;
  sellPropertyToBank?: (request: { paymentOperationId: string; claimId: string; tileID: number }) => void | Promise<Ack>;
  proposeForcedSale?: (request: {
    paymentOperationId: string;
    claimId: string;
    tileID: number;
    buyerPlayerId: string;
    /** What the seller asks the buyer to pay (V1.1); the Bank price when omitted. */
    price?: number;
  }) => void | Promise<Ack>;
  acceptForcedSale?: (proposalId: string) => void | Promise<Ack>;
  rejectForcedSale?: (proposalId: string) => void | Promise<Ack>;
  playAgain?: () => Promise<Ack>;
  /** 2v2: the surviving teammate revives their bankrupt teammate during their own turn; the request carries nothing. */
  reviveTeammate?: () => void | Promise<Ack>;
  /** 2v2: the active teammate answers an Emergency Rescue offer; only the offer id is sent. */
  acceptRescue?: (rescueId: string) => void | Promise<Ack>;
  declineRescue?: (rescueId: string) => void | Promise<Ack>;
}

export interface StateContextValue {
  state: PublicGameState;
  socketFunctions: SocketFunctions;
  playerId: string | null;
  role: RoomRole | null;
  connected: boolean;
  canMutate: boolean;
  privatePlayerState: PrivatePlayerState | null;
  privateOffers: PrivateOffer[];
  roomPlayers?: RoomPlayerMeta[];
  roomStatus?: RoomStatus;
  /** Shown in the HUD status pill. */
  roomCode?: string;
  hostPlayerId?: string | null;
  canPlayAgain?: boolean;
}

export interface TradeTarget {
  tileID: number;
}

export interface TradePromptContextValue {
  tradeTarget: TradeTarget | null;
  openTradeForProperty: (tileID: number) => void;
  closeTrade: () => void;
}
