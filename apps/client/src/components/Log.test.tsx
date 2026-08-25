import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ActivityEvent, PublicGameState } from '@monopoly/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../internal';
import type { SocketFunctions, StateContextValue } from '../types';
import Log, { LOG_IDLE_TIMEOUT_MS } from './Log';

const makeSocketFunctions = (): SocketFunctions => ({
  rollDice: vi.fn(),
  buyProperty: vi.fn(),
  sendChat: vi.fn(),
  makeOffer: vi.fn(),
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  sellHouse: vi.fn(),
  payBail: vi.fn(),
  useJailCard: vi.fn(),
});

function makeState(logs: string[] = [], activity: ActivityEvent[] = []): PublicGameState {
  return {
    boardState: {
      gameStarted: true,
      players: [],
      finishedPlayers: {},
      currentPlayer: { id: '', hasMoved: false },
      turnNumber: 1,
      turnRecovery: null,
      logs,
      diceValue: { dice1: 0, dice2: 0 },
      rollSequence: 0,
      gameplayEvents: { sequence: 0, events: [] },
      activityFeed: { sequence: activity.at(-1)?.sequence ?? 0, events: activity },
      ownedProps: {},
      winner: null,
    },
    players: {},
    turnInfo: {},
    deckCounts: { chance: 0, chest: 0 },
    loaded: true,
  };
}

function makeContext(state: PublicGameState): StateContextValue {
  return {
    state,
    socketFunctions: makeSocketFunctions(),
    playerId: null,
    role: 'SPECTATOR',
    connected: true,
    canMutate: false,
    privatePlayerState: null,
    privateOffers: [],
  };
}

function renderLog(logs: string[] = [], activity: ActivityEvent[] = []) {
  return render(
    <stateContext.Provider value={makeContext(makeState(logs, activity))}>
      <Log />
    </stateContext.Provider>,
  );
}

describe('chat and activity log idle presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts active and fades after exactly three seconds', () => {
    renderLog(['Một dòng nhật ký']);
    const overlay = screen.getByTestId('board-log-overlay');

    expect(overlay.getAttribute('data-idle')).toBe('false');
    void act(() => vi.advanceTimersByTime(LOG_IDLE_TIMEOUT_MS - 1));
    expect(overlay.getAttribute('data-idle')).toBe('false');
    void act(() => vi.advanceTimersByTime(1));
    expect(overlay.getAttribute('data-idle')).toBe('true');
  });

  it('wakes on a genuinely new final log value', () => {
    const view = renderLog(['Cũ']);
    const overlay = screen.getByTestId('board-log-overlay');
    void act(() => vi.advanceTimersByTime(LOG_IDLE_TIMEOUT_MS));
    expect(overlay.getAttribute('data-idle')).toBe('true');

    view.rerender(
      <stateContext.Provider value={makeContext(makeState(['Cũ', 'Mới']))}>
        <Log />
      </stateContext.Provider>,
    );
    expect(overlay.getAttribute('data-idle')).toBe('false');
  });

  it('does not restart activity for equivalent room-state log arrays', () => {
    const view = renderLog(['Giữ nguyên']);
    const overlay = screen.getByTestId('board-log-overlay');
    void act(() => vi.advanceTimersByTime(LOG_IDLE_TIMEOUT_MS - 1));

    view.rerender(
      <stateContext.Provider value={makeContext(makeState(['Giữ nguyên']))}>
        <Log />
      </stateContext.Provider>,
    );
    void act(() => vi.advanceTimersByTime(1));
    expect(overlay.getAttribute('data-idle')).toBe('true');
  });

  it('wakes while typing and while submitting a chat message', () => {
    const view = renderLog();
    const overlay = screen.getByTestId('board-log-overlay');
    const input = screen.getByRole('textbox', { name: 'Tin nhắn' });
    void act(() => vi.advanceTimersByTime(LOG_IDLE_TIMEOUT_MS));
    fireEvent.change(input, { target: { value: 'Xin chào' } });
    expect(overlay.getAttribute('data-idle')).toBe('false');

    void act(() => vi.advanceTimersByTime(LOG_IDLE_TIMEOUT_MS));
    fireEvent.submit(input.closest('form')!);
    expect(overlay.getAttribute('data-idle')).toBe('false');
    view.unmount();
  });

  it('cleans up the idle timeout on unmount', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderLog();
    view.unmount();
    void act(() => vi.advanceTimersByTime(LOG_IDLE_TIMEOUT_MS));
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not duplicate legacy markup when a typed activity tail is available', () => {
    renderLog(
      ['<span class="legacy">old</span>'],
      [{
        eventId: '00000000-0000-4000-8000-000000000010',
        sequence: 1,
        occurredAt: '2026-08-25T12:00:00.000Z',
        type: 'CHAT',
        senderRole: 'PLAYER',
        senderPlayerId: '00000000-0000-4000-8000-000000000001',
        senderName: 'Ada',
        message: 'Xin chào',
      }],
    );

    expect(screen.getByText('Ada: Xin chào')).toBeTruthy();
    expect(screen.queryByText('<span class="legacy">old</span>')).toBeNull();
    expect(document.querySelector('.legacy')).toBeNull();
    expect(document.querySelector('.activity-entry--chat')).not.toBeNull();
  });
});
