import type { Dispatch, SetStateAction } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  OfferId,
  OfferInfo,
  PrivatePlayerState,
  PrivateOffer,
  PublicGameState,
  RoomPlayerMeta,
  RoomRole,
  SaleInfo,
  ServerToClientEvents,
} from '@monopoly/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type DevelopmentRequest = Parameters<ClientToServerEvents['resolve development']>[0];

export interface SocketFunctions {
  rollDice: () => void;
  buyProperty: (operationId: string) => void;
  doNotBuy?: (operationId: string) => void;
  resolveDevelopment?: (request: DevelopmentRequest) => void;
  waitInJail?: () => void;
  sendChat: (message: string) => void;
  putOpenMarket: (saleInfo: SaleInfo) => void;
  makeOffer: (offerInfo: OfferInfo) => void;
  acceptOffer: (offerId: OfferId) => void;
  declineOffer: (offerId: OfferId) => void;
  makeSale: (tileID: number) => void;
  removeSale: (tileID: number) => void;
  sellHouse: (tileID: number) => void;
  mortgageProperty: (tileID: number) => void;
  unmortgageProperty: (tileID: number) => void;
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

export interface SalePrompt {
  tileID: number;
}

export interface SellPromptContextValue {
  handlePutOpenMarket: (tileID: number) => void;
  handleMakeOffer: (tileID: number) => void;
  openSale: SalePrompt | false;
  setOpenSale: Dispatch<SetStateAction<SalePrompt | false>>;
  privateSale: SalePrompt | false;
  setPrivateSale: Dispatch<SetStateAction<SalePrompt | false>>;
}
