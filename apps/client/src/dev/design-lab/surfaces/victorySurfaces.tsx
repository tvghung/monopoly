import WinnerBanner from '../../../components/dashboard/WinnerBanner';
import { OWNED_PAIR, withState, type SurfaceFixture } from './surfaceKit';

/** The end-of-game screen (plan 04 T04.9). */
export const VICTORY_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'winner-host',
    label: 'Victory, host',
    group: 'Victory',
    render: () => withState({
      canPlayAgain: true,
      mutate: room => {
        room.status = 'FINISHED';
        room.gameState.boardState.ownedProps = { ...OWNED_PAIR, 5: { id: 'player-a', color: 'red', houses: 5 } };
        room.gameState.boardState.finishedPlayers = {
          'player-b': { name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT', accountBalance: 0 },
        };
        delete room.gameState.players['player-b'];
        room.gameState.boardState.winner = {
          playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', accountBalance: 3200,
        };
      },
    }, <WinnerBanner />),
  },
  {
    id: 'winner-guest',
    label: 'Victory, guest',
    group: 'Victory',
    render: () => withState({
      playerId: 'player-b',
      mutate: room => {
        room.status = 'FINISHED';
        room.gameState.boardState.ownedProps = { ...OWNED_PAIR };
        room.gameState.boardState.winner = {
          playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', accountBalance: 3200,
        };
      },
    }, <WinnerBanner />),
  },
];
