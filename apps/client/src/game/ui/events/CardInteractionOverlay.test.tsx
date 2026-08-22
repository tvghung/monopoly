import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { SOCKET_PROTOCOL_VERSION, type Ack } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { PresentationController } from '../../presentation/PresentationController';
import { PresentationProvider } from '../../presentation/PresentationProvider';
import { cloneRoom, makeRoom } from '../../presentation/testFixtures';
import CardInteractionOverlay, { CardInteractionProvider } from './CardInteractionOverlay';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function socketFunctions(overrides: Partial<SocketFunctions> = {}): SocketFunctions {
  const success = (): Promise<Ack> => Promise.resolve({
    ok: true,
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    revision: 1,
  });
  return {
    rollDice: vi.fn(),
    buyProperty: vi.fn(),
    doNotBuy: vi.fn(),
    drawCard: vi.fn(success),
    dismissCard: vi.fn(success),
    sendChat: vi.fn(),
    makeOffer: vi.fn(),
    acceptOffer: vi.fn(),
    declineOffer: vi.fn(),
    sellHouse: vi.fn(),
    payBail: vi.fn(),
    useJailCard: vi.fn(),
    ...overrides,
  };
}

function renderOverlay(
  controller: PresentationController,
  room: ReturnType<typeof makeRoom>,
) {
  const contextValue: StateContextValue = {
    state: room.gameState,
    socketFunctions: socketFunctions(),
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
  };
  return render(
    <PresentationProvider controller={controller}>
      <stateContext.Provider value={contextValue}>
        <CardInteractionProvider><CardInteractionOverlay /></CardInteractionProvider>
      </stateContext.Provider>
    </PresentationProvider>,
  );
}

describe('CardInteractionOverlay', () => {
  it('does not expose a live pending card until a queued signal exists', () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const pending = cloneRoom(initial);
    pending.gameState.players['player-a'].currentTile = 7;
    pending.gameState.turnInfo.pendingCardInteraction = {
      operationId: 'overlay-card', playerId: 'player-a', turnNumber: 1, deck: 'chance', sourceTile: 7,
      stage: 'AWAITING_DRAW', continuation: { playerId: 'player-a', turnNumber: 1 },
      deadlineAt: '2026-08-22T00:00:30.000Z',
    };

    const view = renderOverlay(controller, pending);
    expect(screen.queryByTestId('card-focus-overlay')).toBeNull();
    act(() => {
      controller.store.snapDisplayPosition('player-a', 7);
      controller.store.setCardPresentation({
        operationId: 'overlay-card', playerId: 'player-a', deck: 'chance', sourceTile: 7,
        stage: 'AWAITING_DRAW', durationMs: 0,
      });
    });
    expect(screen.getByTestId('card-focus-overlay')).not.toBeNull();
    expect(screen.getAllByText('Nhấn vào thẻ để xem').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Đọc thẻ, sau đó đóng để tiếp tục')).toBeNull();
    view.unmount();
    controller.dispose();
  });

  it('keeps revealed card controls invisible while preserving unlocked Escape/backdrop dismissal', () => {
    vi.useFakeTimers();
    const controller = new PresentationController();
    const room = makeRoom();
    room.gameState.players['player-a'].currentTile = 7;
    room.gameState.turnInfo.pendingCardInteraction = {
      operationId: 'revealed-card', playerId: 'player-a', turnNumber: 1, deck: 'chance', sourceTile: 7,
      stage: 'REVEALED', revealedCardId: 'chance-dividend',
      continuation: { playerId: 'player-a', turnNumber: 1 }, deadlineAt: '2026-08-22T00:00:30.000Z',
    };
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const dismissCard = vi.fn(() => Promise.resolve({
      ok: true as const,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      revision: 1,
    }));
    const contextValue: StateContextValue = {
      state: room.gameState,
      socketFunctions: socketFunctions({ dismissCard }),
      playerId: 'player-a', role: 'PLAYER', connected: true, canMutate: true,
      privatePlayerState: null, privateOffers: [], roomPlayers: room.players,
    };
    render(
      <PresentationProvider controller={controller}>
        <stateContext.Provider value={contextValue}>
          <CardInteractionProvider><CardInteractionOverlay /></CardInteractionProvider>
        </stateContext.Provider>
      </PresentationProvider>,
    );
    expect(screen.queryByText('Đọc thẻ, sau đó đóng để tiếp tục')).toBeNull();
    const closeButton = screen.getByRole('button', { name: 'Đóng thẻ' });
    expect(closeButton.className).toContain('sr-only');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dismissCard).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dismissCard).toHaveBeenCalledWith('revealed-card');
    const backdrop = document.querySelector('.card-focus-overlay__panel--bottom');
    if (backdrop) fireEvent.pointerDown(backdrop);
    controller.dispose();
  });
});
