import type { Dispatch, SetStateAction } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  GameState,
  SaleInfo,
  OfferInfo,
  Offer,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@monopoly/shared';

// The client listens for ServerToClient events and emits ClientToServer ones.
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketFunctions {
  newPlayer: (name: string, roomId: string) => void;
  endTurn: () => void;
  rollDice: () => void;
  buyProperty: () => void;
  sendChat: (message: string) => void;
  putOpenMarket: (saleInfo: SaleInfo) => void;
  makeOffer: (offerInfo: OfferInfo) => void;
  acceptOffer: (offer: Offer) => void;
  declineOffer: (offer: Offer) => void;
  makeSale: (item: string) => void;
  startGame: () => void;
  removeSale: (item: string) => void;
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
  playerId: string | false;
  socket: AppSocket;
}

// A pending "sell"/"offer" prompt; only created once the player is connected.
export interface SalePrompt {
  tileID: number;
  playerId: string;
}

export interface SellPromptContextValue {
  handlePutOpenMarket: (tileID: number) => void;
  handleMakeOffer: (tileID: number) => void;
  openSale: SalePrompt | false;
  setOpenSale: Dispatch<SetStateAction<SalePrompt | false>>;
  privateSale: SalePrompt | false;
  setPrivateSale: Dispatch<SetStateAction<SalePrompt | false>>;
}
