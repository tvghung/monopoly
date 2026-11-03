import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ActivityEvent, PublicGameState } from '@monopoly/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../internal';
import type { SocketFunctions, StateContextValue } from '../types';
import { emptyPresentationState, presentationContext } from '../game/presentation/PresentationProvider';
import type { AnimationQueue } from '../game/presentation/queue/AnimationQueue';
import { HUD_DRAWER_STORAGE_KEY } from '../game/ui/hud/hudDrawer';
import Log, { mergeUngatedChat } from './Log';
import { PresentationController } from '../game/presentation/PresentationController';
import { presentationStoreContext } from '../game/presentation/PresentationProvider';
import { cloneRoom, makeTeamRoom } from '../game/presentation/testFixtures';
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
    expect(document.getElementById('board-log-panel')?.hasAttribute('inert')).toBe(true);
    expect(screen.queryByRole('log')).toBeNull();

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

  it('moves focus into the drawer and makes the exiting panel inert on Escape', () => {
    window.localStorage.removeItem(HUD_DRAWER_STORAGE_KEY);
    renderLog();
    const toggle = screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' });
    fireEvent.click(toggle);
    const panel = document.getElementById('board-log-panel')!;
    expect(document.activeElement).toBe(panel);

    const input = screen.getByRole('textbox', { name: 'Tin nhắn' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    const exitingPanel = document.getElementById('board-log-panel')!;
    expect(exitingPanel.getAttribute('aria-hidden')).toBe('true');
    expect(exitingPanel.hasAttribute('inert')).toBe(true);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }));
    expect(exitingPanel.isConnected).toBe(true);
  });

  it('leaves Escape to an open dialog', () => {
    renderLog();
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-modal="true" aria-label="Cài đặt"></div>');
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

describe('CSS Journal lifecycle', () => {
  afterEach(() => { cleanup(); window.localStorage.clear(); });
  it('keeps one panel through rapid toggles and restores focus after a programmatic close', () => {
    window.localStorage.removeItem(HUD_DRAWER_STORAGE_KEY);
    renderLog();
    const panel = document.getElementById('board-log-panel')!;
    for (let index = 0; index < 6; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: /nhật ký và trò chuyện/ }));
      expect(document.getElementById('board-log-panel')).toBe(panel);
    }
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(window.localStorage.getItem(HUD_DRAWER_STORAGE_KEY)).toBe('closed');
  });

  it('focuses the opening Journal without allowing the renderer to scroll', () => {
    window.localStorage.removeItem(HUD_DRAWER_STORAGE_KEY);
    renderLog();
    const panel = document.getElementById('board-log-panel')!;
    const focus = vi.spyOn(panel, 'focus');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });
});

it('OB-12 renders public Power-up semantics as safe text once across rerender',()=>{
 const name='<img src=x onerror=alert(1)>';const activity:ActivityEvent[]=[{type:'POWER_UP_RECEIVED',playerId:'a',playerName:name,eventId:'receipt',sequence:1,occurredAt:'2026-11-03T00:00:00Z'},{type:'POWER_UP_USED',playerId:'a',playerName:name,definitionId:'U02',cardName:'Tăng Tốc',eventId:'use',sequence:2,occurredAt:'2026-11-03T00:00:01Z'}];
 window.localStorage.setItem(HUD_DRAWER_STORAGE_KEY,'open');
 const view=renderLog([],activity);expect(screen.getAllByText(name+' đã nhận 1 thẻ Power-up')).toHaveLength(1);expect(screen.getAllByText(name+' đã dùng thẻ Tăng Tốc')).toHaveLength(1);expect(view.container.querySelector('img')).toBeNull();
 view.rerender(<stateContext.Provider value={makeContext(makeState([],structuredClone(activity)))}><Log/></stateContext.Provider>);expect(screen.getAllByText(name+' đã nhận 1 thẻ Power-up')).toHaveLength(1);
 view.unmount();window.localStorage.clear();
});


describe('OB-14 colored player references', () => {
  beforeEach(() => window.localStorage.setItem(HUD_DRAWER_STORAGE_KEY, 'open'));
  afterEach(() => { cleanup(); window.localStorage.clear(); });
  const receipt = (id: string, name: string, sequence = 1): ActivityEvent => ({ type: 'POWER_UP_RECEIVED', playerId: id, playerName: name, eventId: 'receipt-' + sequence, sequence, occurredAt: '2026-11-03T00:00:00Z' });
  function withColors(events: ActivityEvent[], colors: Record<string, 'red' | 'blue' | 'yellow'>) {
    const state = makeState([], events);
    for (const [id, color] of Object.entries(colors)) state.boardState.finishedPlayers[id] = { name: 'Same', color, characterId: null, teamId: 'TEAM_1' };
    return state;
  }
  const draw = (state: PublicGameState) => <stateContext.Provider value={makeContext(state)}><Log /></stateContext.Provider>;

  it('colors equal names by ID, preserves historical text, and updates colors on state replacement without adding rows', () => {
    const feed = [receipt('a', 'Same'), receipt('b', 'Same', 2)];
    const view = render(draw(withColors(feed, { a: 'red', b: 'blue' })));
    const names = () => [...view.container.querySelectorAll<HTMLElement>('.activity-player-name')];
    expect(names().map(n => n.dataset.playerId)).toEqual(['a', 'b']);
    expect(names()[0].style.color).not.toBe(names()[1].style.color);
    const first = names()[0].style.color;
    view.rerender(draw(withColors(structuredClone(feed), { a: 'yellow', b: 'blue' })));
    expect(names()[0].style.color).not.toBe(first);
    expect(names().map(n => n.textContent)).toEqual(['Same', 'Same']);
    expect(view.container.querySelectorAll('.activity-entry')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn nhật ký và trò chuyện' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }));
    expect(names()).toHaveLength(2);
  });

  it('styles both transfer endpoints but no matching text in card names or chat', () => {
    const feed: ActivityEvent[] = [
      { type: 'MONEY_TRANSFER', source: { kind: 'PLAYER', playerId: 'a', name: 'Same' }, destination: { kind: 'PLAYER', playerId: 'b', name: 'Same' }, amount: 1, reason: 'RENT', eventId: 'money', sequence: 1, occurredAt: '2026-11-03T00:00:00Z' },
      { type: 'POWER_UP_USED', playerId: 'a', playerName: 'Tăng Tốc', cardName: 'Tăng Tốc', definitionId: 'U02', eventId: 'used', sequence: 2, occurredAt: '2026-11-03T00:00:00Z' },
      { type: 'CHAT', senderRole: 'PLAYER', senderPlayerId: 'a', senderName: 'Tăng Tốc', message: 'Tăng Tốc', eventId: 'chat', sequence: 3, occurredAt: '2026-11-03T00:00:00Z' },
    ];
    const view = render(draw(withColors(feed, { a: 'red', b: 'blue' })));
    expect([...view.container.querySelectorAll('.activity-entry--money_transfer span')].map(n => n.getAttribute('data-player-id'))).toEqual(['a', 'b']);
    expect(view.container.querySelectorAll('.activity-entry--power_up_used span')).toHaveLength(1);
    expect(view.container.querySelector('.activity-entry--power_up_used')?.textContent).toBe('Tăng Tốc đã dùng thẻ Tăng Tốc');
    expect(view.container.querySelector('.activity-entry--chat span')).toBeNull();
  });

  it('escapes names as text, keeps unknown identities plain and never parses legacy markup', () => {
    const name = '<img src=x onerror=alert(1)> {playerName}';
    const view = render(draw(withColors([receipt('a', name), receipt('missing', 'Same', 2)], { a: 'red' })));
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelector('.activity-player-name')?.textContent).toBe(name);
    expect(view.container.querySelectorAll('.activity-player-name')).toHaveLength(1);
    view.rerender(draw(makeState([name])));
    expect(view.container.querySelector('.activity-player-name')).toBeNull();
    expect(screen.getByText(name)).toBeTruthy();
    expect(view.container.querySelector('img')).toBeNull();
  });

  it('uses stored join identity color when a departed player is no longer in the roster', () => {
    const feed: ActivityEvent[] = [{ type: 'PLAYER_JOINED', playerId: 'gone', playerName: 'Old name', color: 'blue', characterId: null, eventId: 'join', sequence: 1, occurredAt: '2026-11-03T00:00:00Z' }, receipt('gone', 'Old name', 2)];
    const view = render(draw(makeState([], feed)));
    expect(view.container.querySelectorAll('[data-player-id="gone"]')).toHaveLength(2);
  });
});


it.each(['player-a', 'player-b', null])('OB-15 publishes completed turns through the live store for viewer %s without releasing the next pending turn', viewer => {
  window.localStorage.setItem(HUD_DRAWER_STORAGE_KEY, 'open');
  const controller = new PresentationController();
  const initial = makeTeamRoom();
  controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
  controller.queue.pause();
  const draw = (room: typeof initial) => <presentationStoreContext.Provider value={{ store: controller.store, queue: controller.queue }}><stateContext.Provider value={makeContext(room.gameState, viewer)}><Log /></stateContext.Provider></presentationStoreContext.Provider>;
  const view = render(draw(initial));
  try {
    const roll = cloneRoom(initial);
    roll.gameState.boardState.currentPlayer.hasMoved = true;
    roll.gameState.boardState.rollSequence++;
    roll.gameState.boardState.diceValue = { dice1: 1, dice2: 1 };
    roll.gameState.players['player-a'].currentTile = 2;
    roll.gameState.boardState.activityFeed = { sequence: 1, events: [{ type: 'POWER_UP_RECEIVED', playerId: 'player-a', playerName: 'An', eventId: 'done-a', sequence: 1, occurredAt: '2026-11-03T00:00:00Z' }] };
    act(() => { controller.acceptRoomSnapshot(roll, 'LIVE_UPDATE'); });
    view.rerender(draw(roll));
    expect(view.container.querySelector('.activity-entry--power_up_received')).toBeNull();
    const end = cloneRoom(roll);
    end.gameState.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
    end.gameState.boardState.turnNumber++;
    act(() => { controller.acceptRoomSnapshot(end, 'LIVE_UPDATE'); });
    view.rerender(draw(end));
    expect(controller.queue.getStatus()).toBe('paused');
    expect(view.container.querySelector('.activity-entry--power_up_received')?.textContent).toBe('An đã nhận 1 thẻ Power-up');
    expect(view.container.querySelector('.activity-player-name')?.getAttribute('data-player-id')).toBe('player-a');
    const next = cloneRoom(end);
    next.gameState.boardState.currentPlayer.hasMoved = true;
    next.gameState.players['player-b'].currentTile = 7;
    next.gameState.turnInfo.pendingLandingDecision = { kind: 'PURCHASE', operationId: 'next-buy', playerId: 'player-b', tileID: 7, price: 100 };
    next.gameState.boardState.activityFeed.events.push({ type: 'POWER_UP_RECEIVED', playerId: 'player-b', playerName: 'Bình', eventId: 'pending-b', sequence: 2, occurredAt: '2026-11-03T00:00:01Z' }, { type: 'CHAT', senderRole: 'PLAYER', senderPlayerId: 'player-d', senderName: 'Dũng', message: 'Chat ngay', eventId: 'chat-live', sequence: 3, occurredAt: '2026-11-03T00:00:02Z' });
    next.gameState.boardState.activityFeed.sequence = 3;
    act(() => { controller.acceptRoomSnapshot(next, 'LIVE_UPDATE'); });
    view.rerender(draw(next));
    expect(view.container.querySelectorAll('.activity-entry--power_up_received')).toHaveLength(1);
    expect(screen.getByText('Dũng: Chat ngay')).toBeTruthy();
    act(() => { controller.acceptRoomSnapshot(next, 'SESSION_SYNC'); });
    view.rerender(draw(next));
    expect(view.container.querySelectorAll('.activity-entry--power_up_received')).toHaveLength(2);
    expect(view.container.querySelectorAll('.activity-entry--chat')).toHaveLength(1);
  } finally { view.unmount(); controller.dispose(); window.localStorage.clear(); }
});
