import type { GameState } from '@monopoly/shared';

// One independent game per room. `state` is mutated in place by the game logic
// and socket handlers; `colors` is that room's pool of player colours (taken
// with pop() on join, returned with push() on disconnect).
export interface Room {
  id: string;
  state: GameState;
  colors: string[];
}

const rooms = new Map<string, Room>();

const freshColors = (): string[] => [
  'black',
  'white',
  'orange',
  'red',
  'blue',
  'green',
  'yellow',
];

const freshState = (): GameState => ({
  boardState: {
    gameStarted: false,
    players: [],
    finishedPlayers: {},
    currentPlayer: { id: '', hasMoved: false },
    logs: [],
    diceValue: { dice1: ['⚅', 0], dice2: ['⚅', 0] },
    ownedProps: {},
    openMarket: {},
  },
  players: {},
  turnInfo: {},
  loaded: true,
});

// Normalise a raw room code to a safe, shareable id; blank falls back to LOBBY.
export const normalizeRoomId = (raw: unknown): string => {
  const value = String(raw ?? '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .trim()
    .slice(0, 20)
    .toUpperCase();
  return value || 'LOBBY';
};

export const getOrCreateRoom = (id: string): Room => {
  let room = rooms.get(id);
  if (!room) {
    room = { id, state: freshState(), colors: freshColors() };
    rooms.set(id, room);
  }
  return room;
};

export const getRoom = (id: string | undefined): Room | undefined => (
  id ? rooms.get(id) : undefined
);

export const deleteRoom = (id: string): void => {
  rooms.delete(id);
};
