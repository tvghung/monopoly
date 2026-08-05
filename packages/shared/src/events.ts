// End-to-end typed Socket.IO event contracts. The server types its `Server` with
// these and the client types its `Socket`, so every emit/listener is checked
// against the same definitions.

import type {
  GameState,
  DiceValue,
  SaleInfo,
  OfferInfo,
  OfferOnProp,
  OfferResult,
  Offer,
} from './types';

export interface ServerToClientEvents {
  update: (state: GameState) => void;
  'offer on prop': (info: OfferOnProp) => void;
  'offer declined': (info: OfferResult) => void;
  'offer accepted': (info: OfferResult) => void;
}

export interface ClientToServerEvents {
  'new player': (name: string, roomId: string) => void;
  'start game': (payload: string) => void;
  makeMove: (num: number) => void;
  'send chat': (message: string) => void;
  'end turn': (payload: string) => void;
  'player has moved': (hasMoved: boolean) => void;
  'buy property': (payload: boolean) => void;
  'send dice': (dices: DiceValue) => void;
  'in jail': (dices: DiceValue) => void;
  'put on open market': (saleInfo: SaleInfo) => void;
  'make offer': (offerInfo: OfferInfo) => void;
  'accept offer': (offer: Offer) => void;
  'decline offer': (offer: Offer) => void;
  'make sale': (item: string) => void;
  'remove sale': (item: string) => void;
}

// Inter-server events (unused here) + per-socket data placeholder.
export type InterServerEvents = Record<string, never>;

export interface SocketData {
  roomId?: string;
}
