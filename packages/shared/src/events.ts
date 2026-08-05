// End-to-end typed Socket.IO event contracts. The server types its `Server` with
// these and the client types its `Socket`, so every emit/listener is checked
// against the same definitions.

import type {
  GameState,
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
  'send chat': (message: string) => void;
  'end turn': (payload: string) => void;
  // The server rolls the dice, moves the player, and resolves the tile it lands
  // on — clients no longer generate dice or drive movement (anti-cheat).
  'roll dice': () => void;
  'buy property': (payload: boolean) => void;
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
