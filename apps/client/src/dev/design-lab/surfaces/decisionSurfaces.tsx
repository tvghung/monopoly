import BuyPrompt from '../../../components/dashboard/BuyPrompt';
import DevelopmentPrompt from '../../../components/dashboard/DevelopmentPrompt';
import JailPanel from '../../../components/dashboard/JailPanel';
import { OWNED_PAIR, withState, type SurfaceFixture } from './surfaceKit';

/** Buy, development, jail, debt, forced sale, trade and incoming offers (plan 04 T04.4 and T04.7). */
export const DECISION_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'buy',
    label: 'Buy prompt',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.turnInfo.pendingLandingDecision = {
          kind: 'PURCHASE', operationId: 'purchase-1', playerId: 'player-a', tileID: 6, price: 100,
        };
      },
    }, <BuyPrompt tokenArrived />),
  },
  {
    id: 'buy-short',
    label: 'Buy prompt, not enough cash',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.players['player-a'].accountBalance = 80;
        room.gameState.turnInfo.pendingLandingDecision = {
          kind: 'PURCHASE', operationId: 'purchase-1', playerId: 'player-a', tileID: 6, price: 100,
        };
      },
    }, <BuyPrompt tokenArrived />),
  },
  {
    id: 'development-houses',
    label: 'Development, houses',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.boardState.ownedProps = { ...OWNED_PAIR };
        room.gameState.turnInfo.pendingLandingDecision = {
          kind: 'DEVELOP_HOUSES', operationId: 'develop-1', playerId: 'player-a', tileID: 1, unitCost: 50, maxQuantity: 3,
        };
      },
    }, <DevelopmentPrompt tokenArrived />),
  },
  {
    id: 'development-hotel',
    label: 'Development, hotel',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.boardState.ownedProps = { 1: { id: 'player-a', color: 'red', houses: 4 }, 3: { id: 'player-a', color: 'red', houses: 4 } };
        room.gameState.turnInfo.pendingLandingDecision = {
          kind: 'UPGRADE_HOTEL', operationId: 'develop-2', playerId: 'player-a', tileID: 1, unitCost: 50, maxQuantity: 1,
        };
      },
    }, <DevelopmentPrompt tokenArrived />),
  },
  {
    id: 'jail',
    label: 'Jail panel',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.players['player-a'].isJail = true;
        room.gameState.players['player-a'].getOutOfJailCardCount = 1;
        room.gameState.players['player-a'].jailOpponentRoundsElapsed = 1;
      },
    }, <div style={{ width: 'min(28rem, 92vw)', margin: '2rem auto' }}><JailPanel /></div>),
  },
];
