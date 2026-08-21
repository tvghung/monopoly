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
  ServerToClientEvents,
} from '@monopoly/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type DevelopmentRequest = Parameters<ClientToServerEvents['resolve development']>[0];

export interface SocketFunctions {
  rollDice: () => Promise<Ack>;
  buyProperty: (operationId: string) => void;
  doNotBuy?: (operationId: string) => void;
  resolveDevelopment?: (request: DevelopmentRequest) => void;
  waitInJail?: () => void;
  sendChat: (message: string) => void;
  makeOffer: (offerInfo: OfferInfo) => void;
  acceptOffer: (offerId: OfferId) => void;
  declineOffer: (offerId: OfferId) => void;
  sellHouse: (tileID: number) => void;
  payBail: () => void;
  useJailCard: () => void;
  sellPropertyToBank?: (request: { paymentOperationId: string; claimId: string; tileID: number }) => void;
  proposeForcedSale?: (request: {
    paymentOperationId: string;
    claimId: string;
    tileID: number;
    buyerPlayerId: string;
  }) => void;
  acceptForcedSale?: (proposalId: string) => void;
  rejectForcedSale?: (proposalId: string) => void;
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
}

export interface TradeTarget {
  tileID: number;
}

export interface TradePromptContextValue {
  tradeTarget: TradeTarget | null;
  openTradeForProperty: (tileID: number) => void;
  closeTrade: () => void;
}
