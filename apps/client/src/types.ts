import type { Dispatch, SetStateAction } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  GameState,
  DiceValue,
  SaleInfo,
  OfferInfo,
  Offer,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@monopoly/shared';

// The client listens for ServerToClient events and emits ClientToServer ones.
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketFunctions {
  makeMove: (num: number) => void;
  newPlayer: (name: string, roomId: string) => void;
  toggleHasMoved: (hasMoved: boolean) => void;
  endTurn: () => void;
  sendDice: (dices: DiceValue) => void;
  inJail: (dices: DiceValue) => void;
  buyProperty: () => void;
  sendChat: (message: string) => void;
  putOpenMarket: (saleInfo: SaleInfo) => void;
  makeOffer: (offerInfo: OfferInfo) => void;
  acceptOffer: (offer: Offer) => void;
  declineOffer: (offer: Offer) => void;
  makeSale: (item: string) => void;
  startGame: () => void;
  removeSale: (item: string) => void;
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
