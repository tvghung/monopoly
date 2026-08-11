import type { Dispatch, SetStateAction } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  GameState,
  OfferId,
  OfferInfo,
  PrivateOffer,
  RoomRole,
  SaleInfo,
  ServerToClientEvents,
} from '@monopoly/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketFunctions {
  rollDice: () => void;
  buyProperty: () => void;
  sendChat: (message: string) => void;
  putOpenMarket: (saleInfo: SaleInfo) => void;
  makeOffer: (offerInfo: OfferInfo) => void;
  acceptOffer: (offerId: OfferId) => void;
  declineOffer: (offerId: OfferId) => void;
  makeSale: (tileID: number) => void;
  removeSale: (tileID: number) => void;
  buildHouse: (tileID: number) => void;
  sellHouse: (tileID: number) => void;
  mortgageProperty: (tileID: number) => void;
  unmortgageProperty: (tileID: number) => void;
  payBail: () => void;
  useJailCard: () => void;
  declineProperty: () => void;
  placeBid: (amount: number) => void;
  passBid: () => void;
}

export interface StateContextValue {
  state: GameState;
  socketFunctions: SocketFunctions;
  playerId: string | null;
  role: RoomRole | null;
  connected: boolean;
  canMutate: boolean;
  privateOffers: PrivateOffer[];
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
