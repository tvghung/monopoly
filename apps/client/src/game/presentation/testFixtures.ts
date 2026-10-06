import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import type { PublicGameState, PublicRoomState, TeamId } from '@monopoly/shared';

/**
 * The four protocol-10 board fields of a Solo game: no winning team, an empty revive state, and the two team slots every room
 * carries (their members are whoever the test seats there). Spread it into a hand-built `boardState`.
 */
export function soloTeamBoardFields(): Pick<PublicGameState['boardState'], 'gameMode' | 'winningTeamId' | 'teams' | 'teamPlay'> {
  return {
    gameMode: 'SOLO',
    winningTeamId: null,
    teams: [
      { teamId: 'TEAM_1', name: 'Team 1', color: 'red', memberPlayerIds: [] },
      { teamId: 'TEAM_2', name: 'Team 2', color: 'blue', memberPlayerIds: [] },
    ],
    teamPlay: { revivedPlayerIds: [], reviveWindows: [] },
  };
}

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
        teamId: 'TEAM_1',
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
        teamId: 'TEAM_2',
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
        gameplayEvents: { sequence: 0, events: [] },
        activityFeed: { sequence: 0, events: [] },
        ownedProps: {},
        winner: null,
        gameMode: 'SOLO',
        winningTeamId: null,
        teams: [
          { teamId: 'TEAM_1', name: 'Team 1', color: 'red', memberPlayerIds: ['player-a'] },
          { teamId: 'TEAM_2', name: 'Team 2', color: 'blue', memberPlayerIds: ['player-b'] },
        ],
        teamPlay: { revivedPlayerIds: [], reviveWindows: [] },
      },
      players: {
        'player-a': {
          name: 'An',
          currentTile: 0,
          color: 'red',
          characterId: 'dog',
          teamId: 'TEAM_1',
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
          teamId: 'TEAM_2',
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

const TEAM_SEATS = [
  { playerId: 'player-a', name: 'An', characterId: 'dog', teamId: 'TEAM_1' },
  { playerId: 'player-b', name: 'Bình', characterId: 'panda', teamId: 'TEAM_2' },
  { playerId: 'player-c', name: 'Chi', characterId: 'cat', teamId: 'TEAM_1' },
  { playerId: 'player-d', name: 'Dũng', characterId: 'duck', teamId: 'TEAM_2' },
] as const;

/**
 * A running 2v2 room in the order the server deals it: An and Chi are "Team 1" (red), Bình and Dũng are "Team 2" (blue), and the
 * turn order alternates An, Bình, Chi, Dũng. Every player wears their team colour, as the server sets it.
 */
export function makeTeamRoom(version = 1): PublicRoomState {
  const room = makeRoom(version);
  const teamColor = { TEAM_1: 'red', TEAM_2: 'blue' } as const;
  const members = (teamId: TeamId) => TEAM_SEATS.filter(seat => seat.teamId === teamId).map(seat => seat.playerId);
  room.players = TEAM_SEATS.map((seat, joinOrder) => ({
    playerId: seat.playerId,
    name: seat.name,
    color: teamColor[seat.teamId],
    characterId: seat.characterId,
    teamId: seat.teamId,
    joinOrder,
    membershipStatus: 'ACTIVE',
    ready: true,
    connected: true,
  }));
  const { boardState } = room.gameState;
  boardState.players = TEAM_SEATS.map(seat => seat.playerId);
  boardState.gameMode = 'TEAM_2V2';
  boardState.teams = [
    { teamId: 'TEAM_1', name: 'Team 1', color: 'red', memberPlayerIds: members('TEAM_1') },
    { teamId: 'TEAM_2', name: 'Team 2', color: 'blue', memberPlayerIds: members('TEAM_2') },
  ];
  room.gameState.players = Object.fromEntries(TEAM_SEATS.map((seat, index) => [seat.playerId, {
    name: seat.name,
    currentTile: index * 5,
    color: teamColor[seat.teamId],
    characterId: seat.characterId,
    teamId: seat.teamId,
    accountBalance: 1500,
    isJail: false,
    jailOpponentRoundsElapsed: 0,
    getOutOfJailCardCount: 0,
  }]));
  return room;
}

export function cloneRoom(room: PublicRoomState, version = room.version + 1): PublicRoomState {
  const cloned = JSON.parse(JSON.stringify(room)) as PublicRoomState;
  cloned.version = version;
  return cloned;
}
