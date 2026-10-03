import { useEffect, type ReactNode } from 'react';
import type { ForcedSaleProposal, PrivateOffer, PrivatePlayerState, PublicRoomState } from '@monopoly/shared';
import BuyPrompt from '../../../components/dashboard/BuyPrompt';
import DebtPanel from '../../../components/dashboard/DebtPanel';
import DevelopmentPrompt from '../../../components/dashboard/DevelopmentPrompt';
import ForcedSaleProposalPanel from '../../../components/dashboard/ForcedSaleProposalPanel';
import IncomingOffers from '../../../components/dashboard/IncomingOffers';
import JailPanel from '../../../components/dashboard/JailPanel';
import TradeOfferModal from '../../../components/dashboard/TradeOfferModal';
import { roomExitContext } from '../../../roomExitContext';
import tradePromptContext from '../../../tradePromptContext';
import {
  makeSurfaceState, noop, OWNED_PAIR, SurfaceProviders, withState, type SurfaceFixture, type SurfaceStateOptions,
} from './surfaceKit';

const DEBT_OPERATION_ID = '00000000-0000-4000-8000-000000000001';

const deadlines = new Map<string, string>();

/**
 * A deadline that stays put while the surface re-renders. The debt dialog resets its choices whenever the claim changes,
 * and a deadline recomputed on every render would look like a new claim each time.
 */
function deadline(key: string, seconds: number): string {
  const known = deadlines.get(key);
  if (known) return known;
  const created = new Date(Date.now() + seconds * 1000).toISOString();
  deadlines.set(key, created);
  return created;
}
const DEBT_CLAIM_ID = '00000000-0000-4000-8000-000000000002';

/** The debtor (An) owes Bình rent and owns four tiles she can sell; Bình owns the tiles around the trade. */
function indebt(room: PublicRoomState) {
  room.gameState.players['player-a'].accountBalance = 40;
  room.gameState.players['player-b'].accountBalance = 900;
  room.gameState.boardState.ownedProps = {
    1: { id: 'player-a', color: 'red', houses: 1 },
    3: { id: 'player-a', color: 'red', houses: 0 },
    5: { id: 'player-a', color: 'red', houses: 0 },
    12: { id: 'player-a', color: 'red', houses: 0 },
    9: { id: 'player-b', color: 'blue', houses: 2 },
  };
  room.gameState.boardState.paymentShortfall = {
    debtorPlayerId: 'player-a',
    creditor: 'PLAYER',
    creditorPlayerId: 'player-b',
    amount: 250,
    remainingAmount: 210,
    source: { kind: 'RENT', tileID: 9 },
    actionDeadlineAt: deadline('debt', 54),
    remainingClaimCount: 1,
    paymentOperationId: DEBT_OPERATION_ID,
    claimId: DEBT_CLAIM_ID,
    sellableProperties: [
      { tileID: 1, grossPrice: 38, houses: 1 },
      { tileID: 3, grossPrice: 30, houses: 0 },
      { tileID: 5, grossPrice: 100, houses: 0 },
      { tileID: 12, grossPrice: 75, houses: 0 },
    ],
  };
}

/** An and Bình each own a few tiles, so both columns of the trade and both sides of an offer have deeds to show. */
function tradeTiles(room: PublicRoomState) {
  room.gameState.boardState.ownedProps = {
    1: { id: 'player-a', color: 'red', houses: 1 },
    3: { id: 'player-a', color: 'red', houses: 0 },
    5: { id: 'player-a', color: 'red', houses: 0 },
    12: { id: 'player-a', color: 'red', houses: 0 },
    8: { id: 'player-b', color: 'blue', houses: 0 },
    9: { id: 'player-b', color: 'blue', houses: 2 },
    15: { id: 'player-b', color: 'blue', houses: 0 },
    25: { id: 'player-b', color: 'blue', houses: 0 },
  };
}

const EXIT = { requestLeave: noop, leaving: false, label: 'Bỏ cuộc' } as const;

/** A surface with private state next to the public room (the forced-sale proposal, held cards, received offers). */
function withPrivate(
  options: SurfaceStateOptions,
  privateState: { privatePlayerState?: PrivatePlayerState | null; privateOffers?: PrivateOffer[] },
  children: ReactNode,
): ReactNode {
  return <SurfaceProviders value={{ ...makeSurfaceState(options), ...privateState }}>{children}</SurfaceProviders>;
}

/** Runs a click once the surface is on screen, then scrolls what it opened into view, for the fixtures of a flow that starts with one. */
function ClickOnMount({ selector, reveal, children }: { selector: string; reveal: string; children: ReactNode }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(selector)?.click();
      window.setTimeout(() => document.querySelector(reveal)?.scrollIntoView({ block: 'center' }), 50);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reveal, selector]);
  return <>{children}</>;
}

function forcedSaleProposal(): ForcedSaleProposal {
  return {
    proposalId: '00000000-0000-4000-8000-000000000003',
    paymentOperationId: DEBT_OPERATION_ID,
    claimId: DEBT_CLAIM_ID,
    sellerPlayerId: 'player-a',
    buyerPlayerId: 'player-b',
    tileID: 1,
    grossPrice: 38,
    expectedHouses: 1,
    expiresAt: deadline('forced-sale', 60),
  };
}

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
  {
    id: 'debt-debtor',
    label: 'Debt, debtor dialog',
    group: 'Decisions',
    render: () => withState(
      { mutate: indebt },
      <roomExitContext.Provider value={EXIT}><DebtPanel /></roomExitContext.Provider>,
    ),
  },
  {
    id: 'debt-debtor-sale-open',
    label: 'Debt, debtor offering a tile to a player',
    group: 'Decisions',
    render: () => withState(
      { mutate: indebt },
      <roomExitContext.Provider value={EXIT}>
        <ClickOnMount selector='[aria-label^="Đề nghị người chơi mua"]' reveal=".debt-panel__buyer-picker"><DebtPanel /></ClickOnMount>
      </roomExitContext.Provider>,
    ),
  },
  {
    id: 'debt-debtor-offer',
    label: 'Debt, a buy offer arrives',
    group: 'Decisions',
    render: () => withPrivate(
      { mutate: indebt },
      {
        privateOffers: [{
          offerId: 'offer-debt-1',
          roomId: 'room-1',
          proposerPlayerId: 'player-b',
          recipientPlayerId: 'player-a',
          proposerName: 'Bình',
          recipientName: 'An',
          offered: { cash: 150, propertyIds: [], jailFreeCardIds: [] },
          requested: { cash: 0, propertyIds: [5], jailFreeCardIds: [] },
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          expiresAt: deadline('debt-offer', 18),
          resolvedAt: null,
        }],
      },
      <roomExitContext.Provider value={EXIT}><DebtPanel /></roomExitContext.Provider>,
    ),
  },
  {
    id: 'debt-observer',
    label: 'Debt, status seen by another player',
    group: 'Decisions',
    render: () => withState(
      { mutate: indebt, playerId: 'player-b' },
      <div style={{ width: 'min(32rem, 92vw)', margin: '2rem auto' }}><DebtPanel /></div>,
    ),
  },
  {
    id: 'forced-sale-buyer',
    label: 'Forced sale, buyer',
    group: 'Decisions',
    render: () => withPrivate(
      { mutate: indebt, playerId: 'player-b' },
      {
        privatePlayerState: {
          playerId: 'player-b', heldJailFreeCardIds: [], gameplayEvents: { sequence: 0, events: [] }, forcedSaleProposal: forcedSaleProposal(),
        },
      },
      <ForcedSaleProposalPanel />,
    ),
  },
  {
    id: 'forced-sale-seller',
    label: 'Forced sale, seller waiting',
    group: 'Decisions',
    render: () => withPrivate(
      { mutate: indebt },
      {
        privatePlayerState: {
          playerId: 'player-a', heldJailFreeCardIds: [], gameplayEvents: { sequence: 0, events: [] }, forcedSaleProposal: forcedSaleProposal(),
        },
      },
      <ForcedSaleProposalPanel />,
    ),
  },
  {
    id: 'trade',
    label: 'Trade offer',
    group: 'Decisions',
    render: () => withPrivate(
      { mutate: tradeTiles },
      { privatePlayerState: { playerId: 'player-a', heldJailFreeCardIds: ['chance-jail-free'], gameplayEvents: { sequence: 0, events: [] } } },
      <tradePromptContext.Provider value={{ tradeTarget: { tileID: 9 }, openTradeForProperty: noop, closeTrade: noop }}>
        <TradeOfferModal />
      </tradePromptContext.Provider>,
    ),
  },
  {
    id: 'incoming-offers',
    label: 'Incoming trade offer',
    group: 'Decisions',
    render: () => withPrivate(
      { mutate: tradeTiles },
      {
        privateOffers: [{
          offerId: 'offer-1',
          roomId: 'room-1',
          proposerPlayerId: 'player-b',
          recipientPlayerId: 'player-a',
          proposerName: 'Bình',
          recipientName: 'An',
          offered: { cash: 100, propertyIds: [9, 8], jailFreeCardIds: [] },
          requested: { cash: 25, propertyIds: [1], jailFreeCardIds: [] },
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          expiresAt: deadline('offer', 47),
          resolvedAt: null,
        }],
      },
      <IncomingOffers />,
    ),
  },
];
