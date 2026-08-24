import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { StrictMode, useContext } from 'react';
import type { PublicGameState, PublicRoomState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import BuyPrompt from '../../components/dashboard/BuyPrompt';
import { PresentationController } from './PresentationController';
import { PresentationProvider, usePresentation } from './PresentationProvider';
import { cloneRoom, makeRoom } from './testFixtures';

afterEach(() => {
  cleanup();
});

function makeSocketFunctions(): SocketFunctions {
  return {
    rollDice: vi.fn(),
    buyProperty: vi.fn(),
    doNotBuy: vi.fn(),
    sendChat: vi.fn(),
    makeOffer: vi.fn(),
    acceptOffer: vi.fn(),
    declineOffer: vi.fn(),
    sellHouse: vi.fn(),
    payBail: vi.fn(),
    useJailCard: vi.fn(),
  };
}

function makeContext(state: PublicGameState, socketFunctions: SocketFunctions): StateContextValue {
  return {
    state,
    socketFunctions,
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
  };
}

function FreezeChainProbe() {
  const { state, playerId } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const player = playerId ? state.players[playerId] : undefined;
  const tokenArrived = !player
    || (presentationState.settledPositions[playerId as string] ?? player.currentTile) === player.currentTile;

  return (
    <>
      <output data-testid="authoritative-position">{player?.currentTile ?? 'missing'}</output>
      <output data-testid="display-position">
        {presentationState.displayPositions[playerId as string] ?? 'missing'}
      </output>
      <output data-testid="settled-position">
        {presentationState.settledPositions[playerId as string] ?? 'missing'}
      </output>
      <output data-testid="presentation-status">{presentationState.status}</output>
      <BuyPrompt tokenArrived={tokenArrived} />
    </>
  );
}

function freezeChainTree(
  controller: PresentationController,
  state: PublicGameState,
  socketFunctions: SocketFunctions,
) {
  return (
    <StrictMode>
      <PresentationProvider controller={controller}>
        <stateContext.Provider value={makeContext(state, socketFunctions)}>
          <FreezeChainProbe />
        </stateContext.Provider>
      </PresentationProvider>
    </StrictMode>
  );
}

function makePurchaseLandingRoom(initial: PublicRoomState): PublicRoomState {
  const live = cloneRoom(initial);
  live.gameState.boardState.diceValue = { dice1: 2, dice2: 2 };
  live.gameState.boardState.rollSequence = 1;
  live.gameState.boardState.currentPlayer = { id: 'player-a', hasMoved: true };
  live.gameState.players['player-a'].currentTile = 4;
  live.gameState.turnInfo.pendingLandingDecision = {
    kind: 'PURCHASE',
    operationId: 'purchase-1',
    playerId: 'player-a',
    tileID: 4,
    price: 60,
  };
  return live;
}

describe('presentation freeze chain', () => {
  it('waits for the visual landing before showing purchase actions, then advances after no-buy', async () => {
    const controller = new PresentationController();
    const socketFunctions = makeSocketFunctions();
    const initial = makeRoom();
    const live = makePurchaseLandingRoom(initial);
    const view = render(freezeChainTree(controller, initial.gameState, socketFunctions));

    act(() => {
      controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    view.rerender(freezeChainTree(controller, live.gameState, socketFunctions));
    act(() => {
      controller.acceptRoomSnapshot(live, 'LIVE_UPDATE');
    });

    expect(screen.getByTestId('authoritative-position').textContent).toBe('4');
    expect(screen.getByTestId('display-position').textContent).toBe('0');
    expect(screen.getByTestId('settled-position').textContent).toBe('0');
    expect(screen.getByTestId('presentation-status').textContent).toBe('playing');
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      await controller.queue.whenIdle();
    });

    expect(screen.getByTestId('display-position').textContent).toBe('4');
    expect(screen.getByTestId('settled-position').textContent).toBe('4');
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Không mua' }));
    expect(socketFunctions.doNotBuy).toHaveBeenCalledWith('purchase-1');

    const nextTurn = cloneRoom(live);
    nextTurn.gameState.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
    delete nextTurn.gameState.turnInfo.pendingLandingDecision;
    view.rerender(freezeChainTree(controller, nextTurn.gameState, socketFunctions));
    act(() => {
      controller.acceptRoomSnapshot(nextTurn, 'LIVE_UPDATE');
    });
    await act(async () => {
      await controller.queue.whenIdle();
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(controller.getState().displayActivePlayerId).toBe('player-b');
  });
});
