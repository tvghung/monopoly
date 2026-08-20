import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import type { PublicRoomState } from '@monopoly/shared';

export function makeRoom(version = 1): PublicRoomState {
  return {
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    version,
    roomId: 'room-1',
    roomCode: 'ROOM1',
    status: 'IN_PROGRESS',
    hostPlayerId: 'player-a',
    minPlayers: 2,
    maxPlayers: 4,
    players: [
      {
        playerId: 'player-a',
        name: 'An',
        color: 'red',
        characterId: 'dog',
        joinOrder: 0,
        membershipStatus: 'ACTIVE',
        ready: true,
        connected: true,
      },
      {
        playerId: 'player-b',
        name: 'Bình',
        color: 'blue',
        characterId: 'panda',
        joinOrder: 1,
        membershipStatus: 'ACTIVE',
        ready: true,
        connected: true,
      },
    ],
    gameState: {
      boardState: {
        gameStarted: true,
        players: ['player-a', 'player-b'],
        finishedPlayers: {},
        currentPlayer: { id: 'player-a', hasMoved: false },
        turnNumber: 1,
        turnRecovery: null,
        logs: [],
        diceValue: { dice1: 0, dice2: 0 },
        rollSequence: 0,
        ownedProps: {},
        winner: null,
      },
      players: {
        'player-a': {
          name: 'An',
          currentTile: 0,
          color: 'red',
          characterId: 'dog',
          accountBalance: 1500,
          isJail: false,
          jailOpponentRoundsElapsed: 0,
          getOutOfJailCardCount: 0,
        },
        'player-b': {
          name: 'Bình',
          currentTile: 5,
          color: 'blue',
          characterId: 'panda',
          accountBalance: 1500,
          isJail: false,
          jailOpponentRoundsElapsed: 0,
          getOutOfJailCardCount: 1,
        },
      },
      turnInfo: {},
      deckCounts: { chance: 16, chest: 16 },
      loaded: true,
    },
  };
}

export function cloneRoom(room: PublicRoomState, version = room.version + 1): PublicRoomState {
  const cloned = JSON.parse(JSON.stringify(room)) as PublicRoomState;
  cloned.version = version;
  return cloned;
}
