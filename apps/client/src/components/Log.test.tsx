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

function makeContext(state: PublicGameState, playerId: string | null = null): StateContextValue {
  return {
    state,
    socketFunctions: makeSocketFunctions(),
    playerId,
    role: playerId ? 'PLAYER' : 'SPECTATOR',
    connected: true,
    canMutate: false,
    privatePlayerState: null,
    privateOffers: [],
  };
}

function renderLog(logs: string[] = [], activity: ActivityEvent[] = [], playerId: string | null = null) {
  return render(
    <stateContext.Provider value={makeContext(makeState(logs, activity), playerId)}>
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

  it('shows authoritative landing narration and suppresses dice arithmetic', () => {
    renderLog([], [
      {
        eventId: '00000000-0000-4000-8000-000000000011',
        sequence: 1,
        occurredAt: '2026-08-25T12:00:00.000Z',
        type: 'DICE_ROLL',
        playerId: '00000000-0000-4000-8000-000000000001',
        playerName: 'An',
        dice1: 3,
        dice2: 5,
        total: 8,
        context: 'TURN',
      },
      {
        eventId: '00000000-0000-4000-8000-000000000012',
        sequence: 2,
        occurredAt: '2026-08-25T12:00:01.000Z',
        type: 'TILE_LANDED',
        playerId: '00000000-0000-4000-8000-000000000001',
        playerName: 'An',
        tileID: 10,
      },
    ]);

    expect(screen.getByText('An đang Thăm Tù.')).toBeTruthy();
    expect(screen.queryByText(/3 \+ 5 = 8/u)).toBeNull();
    expect(document.querySelector('.activity-entry--dice_roll')).toBeNull();
  });

  it('renders every landing category from canonical tile data', () => {
    const cases = [
      [0, 'An đã tới Xuất Phát.'],
      [1, 'An đã tới Cà Mau.'],
      [2, 'An đã tới Khí Vận.'],
      [4, 'An đã tới Thuế Thu Nhập.'],
      [5, 'An đã tới Ga Hà Nội.'],
      [7, 'An đã tới Cơ Hội.'],
      [10, 'An đang Thăm Tù.'],
      [12, 'An đã tới Công Ty Điện.'],
      [20, 'An đã tới Bãi Đỗ Xe.'],
      [30, 'An đã tới ô Vào Tù.'],
    ] as const;
    const events: ActivityEvent[] = cases.map(([tileID], index) => ({
      eventId: `00000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`,
      sequence: index + 1,
      occurredAt: `2026-08-25T12:00:${String(index).padStart(2, '0')}.000Z`,
      type: 'TILE_LANDED',
      playerId: '00000000-0000-4000-8000-000000000001',
      playerName: 'An',
      tileID,
    }));

    renderLog([], events);

    for (const [, text] of cases) expect(screen.getByText(text)).toBeTruthy();
  });

  it('opens by default and counts only new other-player chat by sequence while closed', () => {
    const localPlayerId = '00000000-0000-4000-8000-000000000001';
    const otherPlayerId = '00000000-0000-4000-8000-000000000002';
    const view = renderLog([], [], localPlayerId);
    const toggle = screen.getByRole('button', { name: 'Ẩn nhật ký và trò chuyện' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('board-log-panel')).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const activity: ActivityEvent[] = [
      {
        eventId: '00000000-0000-4000-8000-000000000031', sequence: 31,
        occurredAt: '2026-08-25T12:00:31.000Z', type: 'CHAT', senderRole: 'PLAYER',
        senderPlayerId: otherPlayerId, senderName: 'Bình', message: 'Một',
      },
      {
        eventId: '00000000-0000-4000-8000-000000000032', sequence: 32,
        occurredAt: '2026-08-25T12:00:32.000Z', type: 'CHAT', senderRole: 'PLAYER',
        senderPlayerId: localPlayerId, senderName: 'An', message: 'Của tôi',
      },
      {
        eventId: '00000000-0000-4000-8000-000000000033', sequence: 33,
        occurredAt: '2026-08-25T12:00:33.000Z', type: 'CHAT', senderRole: 'PLAYER',
        senderPlayerId: otherPlayerId, senderName: 'Bình', message: 'Hai',
      },
    ];
    view.rerender(
      <stateContext.Provider value={makeContext(makeState([], activity), localPlayerId)}>
        <Log />
      </stateContext.Provider>,
    );

    expect(screen.getByLabelText('2 tin nhắn chưa đọc').textContent).toBe('2');
    view.rerender(
      <stateContext.Provider value={makeContext(makeState([], activity), localPlayerId)}>
        <Log />
      </stateContext.Provider>,
    );
    expect(screen.getByLabelText('2 tin nhắn chưa đọc').textContent).toBe('2');

    fireEvent.click(toggle);
    expect(screen.queryByLabelText(/tin nhắn chưa đọc/u)).toBeNull();
    expect(document.getElementById('board-log-panel')).not.toBeNull();
  });

  it('does not mark historical chat unread and resets safely when activity sequence rolls back', () => {
    const historical: ActivityEvent[] = [{
      eventId: '00000000-0000-4000-8000-000000000090', sequence: 90,
      occurredAt: '2026-08-25T12:01:30.000Z', type: 'CHAT', senderRole: 'PLAYER',
      senderPlayerId: '00000000-0000-4000-8000-000000000002', senderName: 'Bình', message: 'Cũ',
    }];
    const view = renderLog([], historical);
    const toggle = screen.getByRole('button', { name: 'Ẩn nhật ký và trò chuyện' });
    expect(screen.queryByLabelText(/tin nhắn chưa đọc/u)).toBeNull();
    fireEvent.click(toggle);

    const newer = [{ ...historical[0], eventId: '00000000-0000-4000-8000-000000000100', sequence: 100, message: 'Mới' }];
    view.rerender(
      <stateContext.Provider value={makeContext(makeState([], newer))}>
        <Log />
      </stateContext.Provider>,
    );
    expect(screen.getByLabelText('1 tin nhắn chưa đọc')).toBeTruthy();

    const reset = [{ ...historical[0], eventId: '00000000-0000-4000-8000-000000000001', sequence: 1 }];
    view.rerender(
      <stateContext.Provider value={makeContext(makeState([], reset))}>
        <Log />
      </stateContext.Provider>,
    );
    expect(screen.queryByLabelText(/tin nhắn chưa đọc/u)).toBeNull();
  });

  it('keeps unread across feed truncation and caps the badge at 99+', () => {
    const view = renderLog();
    const toggle = screen.getByRole('button', { name: 'Ẩn nhật ký và trò chuyện' });
    fireEvent.click(toggle);
    const chats: ActivityEvent[] = Array.from({ length: 105 }, (_, index) => ({
      eventId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      sequence: index + 1,
      occurredAt: '2026-08-25T12:00:00.000Z',
      type: 'CHAT',
      senderRole: 'PLAYER',
      senderPlayerId: '00000000-0000-4000-8000-000000000002',
      senderName: 'Bình',
      message: `Tin ${index + 1}`,
    }));
    view.rerender(
      <stateContext.Provider value={makeContext(makeState([], chats))}>
        <Log />
      </stateContext.Provider>,
    );

    expect(screen.getByLabelText('105 tin nhắn chưa đọc').textContent).toBe('99+');
    const truncated = [{ ...chats[104], eventId: '00000000-0000-4000-8000-000000000129', sequence: 129 }];
    view.rerender(
      <stateContext.Provider value={makeContext(makeState([], truncated))}>
        <Log />
      </stateContext.Provider>,
    );
    expect(screen.getByLabelText('106 tin nhắn chưa đọc').textContent).toBe('99+');
  });
});
