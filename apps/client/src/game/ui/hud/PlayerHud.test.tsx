import {
  act, cleanup, render, screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import type { StateContextValue } from '../../../types';
import { PresentationController } from '../../presentation/PresentationController';
import { PresentationProvider } from '../../presentation/PresentationProvider';
import { presentationTiming } from '../../presentation/timings';
import { cloneRoom, makeRoom } from '../../presentation/testFixtures';
import PlayerHud from './PlayerHud';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function contextValue(room = makeRoom()): StateContextValue {
  return {
    state: room.gameState,
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
    socketFunctions: {
      rollDice: vi.fn(),
      buyProperty: vi.fn(),
      sendChat: vi.fn(),
      makeOffer: vi.fn(),
      acceptOffer: vi.fn(),
      declineOffer: vi.fn(),
      sellHouse: vi.fn(),
      payBail: vi.fn(),
      useJailCard: vi.fn(),
    },
  };
}

function renderHud(controller: PresentationController, room = makeRoom(), activePlayerId = 'player-a') {
  return render(
    <PresentationProvider controller={controller}>
      <stateContext.Provider value={contextValue(room)}>
        <PlayerHud activePlayerId={activePlayerId} />
      </stateContext.Provider>
    </PresentationProvider>,
  );
}

describe('PlayerHud balance feedback', () => {
  it('shows a transient delta while keeping the authoritative balance permanent', () => {
    vi.useFakeTimers();
    const controller = new PresentationController();
    const room = makeRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    renderHud(controller, room);

    act(() => controller.store.emitBalanceDelta('balance-1', 'player-a', 1500, 1680, 0));
    expect(screen.getByText('+180.000 ₫')).toBeTruthy();
    expect(screen.getAllByText('1.500.000 ₫').length).toBeGreaterThan(0);

    act(() => { vi.advanceTimersByTime(presentationTiming.feedbackDwell - 1); });
    expect(screen.getByText('+180.000 ₫')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText('+180.000 ₫')).toBeNull();
    expect(screen.getAllByText('1.500.000 ₫').length).toBeGreaterThan(0);
    controller.dispose();
  });

  it('announces a new turn without replaying the previous balance event', () => {
    const controller = new PresentationController();
    const room = makeRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const view = renderHud(controller, room);

    act(() => controller.store.emitBalanceDelta('balance-2', 'player-a', 1500, 1320, 0));
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('mất');

    view.rerender(
      <PresentationProvider controller={controller}>
        <stateContext.Provider value={contextValue(room)}>
          <PlayerHud activePlayerId="player-b" />
        </stateContext.Provider>
      </PresentationProvider>,
    );
    expect(status.textContent).toBe('Đến lượt Bình.');
    expect(status.textContent).not.toContain('mất');
    controller.dispose();
  });

  it('clears balance feedback and announcement on snapshot reset', () => {
    const controller = new PresentationController();
    const room = makeRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    renderHud(controller, room);

    act(() => controller.store.emitBalanceDelta('balance-3', 'player-a', 1500, 1200, 0));
    expect(screen.getByText('-300.000 ₫')).toBeTruthy();
    act(() => { controller.acceptRoomSnapshot(cloneRoom(room), 'SESSION_SYNC'); });
    expect(screen.queryByText('-300.000 ₫')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
    controller.dispose();
  });

  it('keeps semantic balance text readable when the presentation duration is zero', () => {
    vi.useFakeTimers();
    const controller = new PresentationController(true);
    const room = makeRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    renderHud(controller, room);

    act(() => controller.store.emitBalanceDelta('balance-reduced', 'player-a', 1500, 1200, 0));
    act(() => { vi.advanceTimersByTime(1); });

    expect(screen.getByText('-300.000 ₫')).toBeTruthy();
    controller.dispose();
  });
});
