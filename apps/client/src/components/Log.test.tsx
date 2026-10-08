import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ActivityEvent, PublicGameState } from '@monopoly/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../internal';
import type { SocketFunctions, StateContextValue } from '../types';
import { emptyPresentationState, presentationContext } from '../game/presentation/PresentationProvider';
import type { AnimationQueue } from '../game/presentation/queue/AnimationQueue';
import { HUD_DRAWER_STORAGE_KEY } from '../game/ui/hud/hudDrawer';
import Log, { mergeUngatedChat } from './Log';
import { soloTeamBoardFields } from '../game/presentation/testFixtures';

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
      ...soloTeamBoardFields(),
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

describe('activity drawer', () => {
  beforeEach(() => {
    // Most tests read the log content, so they start with the drawer left open by the viewer.
    window.localStorage.setItem(HUD_DRAWER_STORAGE_KEY, 'open');
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('is closed by default, shows only its tab, and remembers the viewer’s choice', () => {
    window.localStorage.removeItem(HUD_DRAWER_STORAGE_KEY);
    renderLog(['Một dòng nhật ký']);
    const toggle = screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('board-log-panel');
    expect(document.getElementById('board-log-panel')).toBeNull();
    expect(screen.queryByText('Một dòng nhật ký')).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Ẩn nhật ký và trò chuyện' }).getAttribute('aria-expanded')).toBe('true');
    expect(window.localStorage.getItem(HUD_DRAWER_STORAGE_KEY)).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn nhật ký và trò chuyện' }));
    expect(window.localStorage.getItem(HUD_DRAWER_STORAGE_KEY)).toBe('closed');
  });

  it('opens again when the viewer left it open, and survives blocked storage', () => {
    renderLog(['Đã mở']);
    expect(screen.getByText('Đã mở')).toBeTruthy();
    cleanup();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderLog(['Không lưu được']);
    fireEvent.click(screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }));
    expect(screen.getByText('Không lưu được')).toBeTruthy();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('no longer fades: there is no idle state, attribute or timer', () => {
    vi.useFakeTimers();
    renderLog(['Một dòng nhật ký']);
    const overlay = screen.getByTestId('board-log-overlay');
    expect(overlay.hasAttribute('data-idle')).toBe(false);
    expect(overlay.className).not.toContain('idle');
    expect(vi.getTimerCount()).toBe(0);
    void act(() => vi.advanceTimersByTime(60_000));
    expect(overlay.hasAttribute('data-idle')).toBe(false);
  });

  it('moves focus into the drawer when it opens and back to the tab when Escape closes it', () => {
    window.localStorage.removeItem(HUD_DRAWER_STORAGE_KEY);
    renderLog();
    const toggle = screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' });
    fireEvent.click(toggle);
    const panel = document.getElementById('board-log-panel')!;
    expect(document.activeElement).toBe(panel);

    const input = screen.getByRole('textbox', { name: 'Tin nhắn' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.getElementById('board-log-panel')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }));
  });

  it('leaves Escape to an open dialog', () => {
    renderLog();
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-label="Cài đặt"></div>');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Tin nhắn' }), { key: 'Escape' });
    expect(document.getElementById('board-log-panel')).not.toBeNull();
    document.querySelector('[role="dialog"]')!.remove();
  });

  it('keeps the chat form working', () => {
    const socketFunctions = makeSocketFunctions();
    render(
      <stateContext.Provider value={{ ...makeContext(makeState()), socketFunctions }}>
        <Log />
      </stateContext.Provider>,
    );
    const input = screen.getByRole('textbox', { name: 'Tin nhắn' });
    fireEvent.change(input, { target: { value: 'Xin chào' } });
    fireEvent.submit(input.closest('form')!);
    expect(socketFunctions.sendChat).toHaveBeenCalledWith('Xin chào');
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

  it('counts only new other-player chat by sequence while closed', () => {
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

  it('marks the tab when a gameplay line arrives while closed, and clears the mark when the Journal opens', () => {
    const view = renderLog([], []);
    const toggle = screen.getByRole('button', { name: 'Ẩn nhật ký và trò chuyện' });
    fireEvent.click(toggle);
    expect(screen.queryByTestId('log-new-activity')).toBeNull();

    const roll: ActivityEvent = {
      eventId: '00000000-0000-4000-8000-000000000041', sequence: 41, occurredAt: '2026-08-25T12:00:41.000Z',
      type: 'DICE_ROLL', playerId: '00000000-0000-4000-8000-000000000002', playerName: 'Bình',
      dice1: 2, dice2: 3, total: 5, context: 'TURN',
    };
    view.rerender(
      <stateContext.Provider value={makeContext(makeState([], [roll]))}>
        <Log />
      </stateContext.Provider>,
    );
    expect(screen.getByTestId('log-new-activity').textContent).toBe('Có diễn biến mới trong nhật ký');
    expect(toggle.getAttribute('aria-describedby')).toContain('board-log-new');
    // Not a chat message: the numeric chat badge stays away.
    expect(screen.queryByLabelText(/tin nhắn chưa đọc/u)).toBeNull();

    fireEvent.click(toggle);
    expect(screen.queryByTestId('log-new-activity')).toBeNull();
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

  const OTHER = '00000000-0000-4000-8000-000000000002';
  const landedAt = (sequence: number, tileID: number): ActivityEvent => ({
    eventId: `00000000-0000-4000-8000-${String(sequence + 200).padStart(12, '0')}`,
    sequence,
    occurredAt: '2026-08-25T12:00:00.000Z',
    type: 'TILE_LANDED',
    playerId: '00000000-0000-4000-8000-000000000001',
    playerName: 'An',
    tileID,
  });
  const chatAt = (sequence: number, message: string): ActivityEvent => ({
    eventId: `00000000-0000-4000-8000-${String(sequence + 300).padStart(12, '0')}`,
    sequence,
    occurredAt: '2026-08-25T12:00:00.000Z',
    type: 'CHAT',
    senderRole: 'PLAYER',
    senderPlayerId: OTHER,
    senderName: 'Bình',
    message,
  });

  it('merges chat from the authoritative feed into the gated gameplay entries, ordered by sequence', () => {
    const gated = [landedAt(1, 1), chatAt(2, 'cũ trong hàng đợi')];
    const authoritative = [landedAt(1, 1), chatAt(2, 'cũ trong hàng đợi'), landedAt(3, 2), chatAt(4, 'mới nhất')];
    expect(mergeUngatedChat(gated, authoritative).map(event => event.sequence)).toEqual([1, 2, 4]);
    expect(mergeUngatedChat(authoritative, authoritative)).toBe(authoritative);
  });

  it('shows chat and counts it unread at once while gameplay entries wait for the presentation', () => {
    const gated = [landedAt(1, 1)];
    const authoritative = [landedAt(1, 1), landedAt(2, 2), chatAt(3, 'nhanh lên!')];
    const presentation = { ...emptyPresentationState, displayActivity: gated, displayLogs: [] };
    const renderGated = (feed: ActivityEvent[]) => (
      <presentationContext.Provider value={{ state: presentation, queue: {} as unknown as AnimationQueue }}>
        <stateContext.Provider value={makeContext(makeState([], feed))}>
          <Log />
        </stateContext.Provider>
      </presentationContext.Provider>
    );
    window.localStorage.setItem(HUD_DRAWER_STORAGE_KEY, 'closed');
    const view = render(renderGated([landedAt(1, 1)]));
    view.rerender(renderGated(authoritative));
    expect(screen.getByLabelText('1 tin nhắn chưa đọc').textContent).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }));
    expect(screen.getByText('Bình: nhanh lên!')).toBeTruthy();
    expect(screen.getByText('An đã tới Cà Mau.')).toBeTruthy();
    // The second landing is still held back by the presentation queue.
    expect(screen.queryByText('An đã tới Khí Vận.')).toBeNull();
  });

  it('exposes the unread count to assistive technology through the tab’s description', () => {
    window.localStorage.setItem(HUD_DRAWER_STORAGE_KEY, 'closed');
    const view = renderLog();
    view.rerender(
      <stateContext.Provider value={makeContext(makeState([], [chatAt(5, 'Xin chào'), chatAt(6, 'Còn đó không?')]))}>
        <Log />
      </stateContext.Provider>,
    );
    const toggle = screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' });
    const badge = screen.getByLabelText('2 tin nhắn chưa đọc');
    expect(toggle.getAttribute('aria-describedby')).toBe(badge.id);
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Ẩn nhật ký và trò chuyện' }).hasAttribute('aria-describedby')).toBe(false);
  });

  it('forgets a half-typed message when the drawer closes so reopening never sends it unseen', () => {
    const socketFunctions = makeSocketFunctions();
    render(
      <stateContext.Provider value={{ ...makeContext(makeState()), socketFunctions }}>
        <Log />
      </stateContext.Provider>,
    );
    const input = screen.getByRole('textbox', { name: 'Tin nhắn' });
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }));
    const reopened = screen.getByRole('textbox', { name: 'Tin nhắn' });
    expect((reopened as HTMLInputElement).value).toBe('');
    fireEvent.submit(reopened.closest('form')!);
    expect(socketFunctions.sendChat).not.toHaveBeenCalled();
  });
});
