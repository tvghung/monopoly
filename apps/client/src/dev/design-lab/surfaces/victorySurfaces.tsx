import type { PublicRoomState } from '@monopoly/shared';
import WinnerBanner from '../../../components/dashboard/WinnerBanner';
import { roomExitContext, type RoomExitContextValue } from '../../../roomExitContext';
import { makeTeamRoom } from '../../../game/presentation/testFixtures';
import { noop, OWNED_PAIR, withState, type SurfaceFixture, type SurfaceStateOptions } from './surfaceKit';

const ROOM_EXIT: RoomExitContextValue = { requestLeave: noop, leaving: false, label: 'Rời phòng' };

/** The end-of-game dialog inside the room-exit context of the app shell, so its "Rời phòng" button shows. */
function victory(options: SurfaceStateOptions) {
  return withState(options, (
    <roomExitContext.Provider value={ROOM_EXIT}>
      <WinnerBanner />
    </roomExitContext.Provider>
  ));
}

/** An (host, red) wins a finished room; Bình (blue) went bankrupt and is out of the game. */
function finishWithWinner(room: PublicRoomState) {
  room.status = 'FINISHED';
  room.gameState.boardState.ownedProps = { ...OWNED_PAIR, 5: { id: 'player-a', color: 'red', houses: 5 } };
  room.gameState.boardState.finishedPlayers = {
    'player-b': { name: 'Bình', color: 'blue', characterId: 'panda', teamId: 'TEAM_2', reason: 'BANKRUPT', accountBalance: 0 },
  };
  delete room.gameState.players['player-b'];
  room.gameState.players['player-a'].accountBalance = 3200;
  room.gameState.boardState.winner = {
    playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', teamId: 'TEAM_1', accountBalance: 3200,
  };
}

/** The four-seat variant: one bankruptcy, one player who left with cash, one more bankruptcy with a long name. */
function finishFourSeats(room: PublicRoomState) {
  finishWithWinner(room);
  room.players.push(
    {
      playerId: 'player-c', name: 'Chi', color: 'green', characterId: 'cat', teamId: 'TEAM_1', teamSlot: 1, joinOrder: 2,
      membershipStatus: 'ACTIVE', ready: true, connected: true, kind: 'HUMAN' as const,
    },
    {
      playerId: 'player-d', name: 'Nguyễn Thị Bích Phượng', color: 'yellow', characterId: 'penguin', teamId: 'TEAM_2', teamSlot: 1, joinOrder: 3,
      membershipStatus: 'ACTIVE', ready: true, connected: true, kind: 'HUMAN' as const,
    },
  );
  room.gameState.boardState.finishedPlayers['player-c'] = {
    name: 'Chi', color: 'green', characterId: 'cat', teamId: 'TEAM_1', reason: 'LEFT', accountBalance: 850,
  };
  room.gameState.boardState.finishedPlayers['player-d'] = {
    name: 'Nguyễn Thị Bích Phượng', color: 'yellow', characterId: 'penguin', teamId: 'TEAM_2', reason: 'BANKRUPT', accountBalance: 0,
  };
}

/** Rồng (An and Chi) wins; Chi was bankrupt earlier, which does not take the win away from her. */
function finishWithTeam(room: PublicRoomState) {
  const team = makeTeamRoom();
  room.players = team.players;
  room.gameState = team.gameState;
  room.status = 'FINISHED';
  const { boardState } = room.gameState;
  boardState.teams[0].name = 'Rồng';
  boardState.teams[1].name = 'Phượng';
  delete room.gameState.players['player-c'];
  delete room.gameState.players['player-b'];
  delete room.gameState.players['player-d'];
  boardState.players = ['player-a'];
  boardState.finishedPlayers = {
    'player-c': { teamId: 'TEAM_1', name: 'Chi', color: 'red', characterId: 'cat', reason: 'BANKRUPT', accountBalance: 0 },
    'player-b': { teamId: 'TEAM_2', name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT', accountBalance: 0 },
    'player-d': { teamId: 'TEAM_2', name: 'Dũng', color: 'blue', characterId: 'duck', reason: 'BANKRUPT', accountBalance: 0 },
  };
  room.gameState.players['player-a'].accountBalance = 2_850;
  boardState.ownedProps = { ...OWNED_PAIR, 5: { id: 'player-a', color: 'red', houses: 5 } };
  boardState.winningTeamId = 'TEAM_1';
  boardState.winner = {
    playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', teamId: 'TEAM_1', accountBalance: 2_850,
  };
}

/** The end-of-game screen (plan 04 T04.9). */
export const VICTORY_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'winner-host',
    label: 'Victory, host',
    group: 'Victory',
    render: () => victory({ canPlayAgain: true, mutate: finishWithWinner }),
  },
  {
    id: 'winner-team',
    label: 'Victory, 2v2 team (host)',
    group: 'Victory',
    render: () => victory({ canPlayAgain: true, mutate: finishWithTeam }),
  },
  {
    id: 'winner-guest',
    label: 'Victory, guest',
    group: 'Victory',
    render: () => victory({ playerId: 'player-b', mutate: finishWithWinner }),
  },
  {
    id: 'winner-spectator',
    label: 'Victory, spectator',
    group: 'Victory',
    render: () => victory({ playerId: null, role: 'SPECTATOR', canMutate: false, mutate: finishWithWinner }),
  },
  {
    id: 'winner-many-players',
    label: 'Victory, four seats',
    group: 'Victory',
    render: () => victory({ canPlayAgain: true, mutate: finishFourSeats }),
  },
];
