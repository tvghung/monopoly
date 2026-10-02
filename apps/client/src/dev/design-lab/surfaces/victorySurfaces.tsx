import type { PublicRoomState } from '@monopoly/shared';
import WinnerBanner from '../../../components/dashboard/WinnerBanner';
import { roomExitContext, type RoomExitContextValue } from '../../../roomExitContext';
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
    'player-b': { name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT', accountBalance: 0 },
  };
  delete room.gameState.players['player-b'];
  room.gameState.players['player-a'].accountBalance = 3200;
  room.gameState.boardState.winner = {
    playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', accountBalance: 3200,
  };
}

/** The four-seat variant: one bankruptcy, one player who left with cash, one more bankruptcy with a long name. */
function finishFourSeats(room: PublicRoomState) {
  finishWithWinner(room);
  room.players.push(
    {
      playerId: 'player-c', name: 'Chi', color: 'green', characterId: 'cat', joinOrder: 2,
      membershipStatus: 'ACTIVE', ready: true, connected: true,
    },
    {
      playerId: 'player-d', name: 'Nguyễn Thị Bích Phượng', color: 'yellow', characterId: 'penguin', joinOrder: 3,
      membershipStatus: 'ACTIVE', ready: true, connected: true,
    },
  );
  room.gameState.boardState.finishedPlayers['player-c'] = {
    name: 'Chi', color: 'green', characterId: 'cat', reason: 'LEFT', accountBalance: 850,
  };
  room.gameState.boardState.finishedPlayers['player-d'] = {
    name: 'Nguyễn Thị Bích Phượng', color: 'yellow', characterId: 'penguin', reason: 'BANKRUPT', accountBalance: 0,
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
