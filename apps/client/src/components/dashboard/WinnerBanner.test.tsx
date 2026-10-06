import {
  act, cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type { Ack, PublicGameState, RoomPlayerMeta } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import { roomExitContext, type RoomExitContextValue } from '../../roomExitContext';
import { SHORT_VIEWPORT_QUERY } from '../../design-system/useMediaQuery';
import { DEFAULT_GAME_SETTINGS } from '../../settings/defaults';
import { SettingsProvider } from '../../settings/SettingsProvider';
import { presentationStoreContext } from '../../game/presentation/PresentationProvider';
import type { AnimationQueue } from '../../game/presentation/queue/AnimationQueue';
import { PresentationStore } from '../../game/presentation/store/presentationStore';
import { makeRoom, makeTeamRoom } from '../../game/presentation/testFixtures';
import type { SocketFunctions, StateContextValue } from '../../types';
import { getOtherPlayers, getWinnerSummary } from './WinnerBanner';
import WinnerBanner from './WinnerBanner';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function winnerState(mutate?: (state: PublicGameState) => void): PublicGameState {
  const room = makeRoom();
  room.status = 'FINISHED';
  room.gameState.players['player-a'] = {
    ...room.gameState.players['player-a'],
    name: 'Wrong live name',
    accountBalance: 1_200,
  };
  room.gameState.boardState.winner = {
    teamId: 'TEAM_1',
    playerId: 'player-a',
    name: 'Ada',
    color: 'red',
    characterId: 'dog',
    accountBalance: 1_200,
  };
  room.gameState.boardState.ownedProps = {
    1: { id: 'player-a', color: 'red', houses: 2 },
    3: { id: 'player-a', color: 'red', houses: 5 },
  };
  mutate?.(room.gameState);
  return room.gameState;
}

/** Bình (blue panda) is out of the game and no longer a seated player. */
function withBankruptBinh(state: PublicGameState) {
  delete state.players['player-b'];
  state.boardState.finishedPlayers = {
    'player-b': { teamId: 'TEAM_2', name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT', accountBalance: 0 },
  };
}

function makeSocketFunctions(playAgain: SocketFunctions['playAgain']): SocketFunctions {
  return {
    rollDice: vi.fn(),
    buyProperty: vi.fn(),
    sendChat: vi.fn(),
    makeOffer: vi.fn(),
    acceptOffer: vi.fn(),
    declineOffer: vi.fn(),
    sellHouse: vi.fn(),
    payBail: vi.fn(),
    useJailCard: vi.fn(),
    playAgain,
  };
}

const acceptedAgain = () => vi.fn<NonNullable<SocketFunctions['playAgain']>>(
  () => Promise.resolve({ ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION } satisfies Ack),
);

interface WinnerOptions {
  canPlayAgain?: boolean;
  playAgain?: SocketFunctions['playAgain'];
  state?: PublicGameState;
  playerId?: string | null;
  role?: StateContextValue['role'];
  roomPlayers?: RoomPlayerMeta[];
  exit?: RoomExitContextValue | null;
  store?: PresentationStore;
  reducedMotion?: boolean;
}

function winnerTree(options: WinnerOptions = {}): ReactNode {
  const {
    canPlayAgain = false,
    playAgain = acceptedAgain(),
    state = winnerState(),
    playerId = 'player-a',
    role = playerId === null ? 'SPECTATOR' : 'PLAYER',
    roomPlayers,
    exit = null,
    store,
    reducedMotion = false,
  } = options;
  const value: StateContextValue = {
    state,
    socketFunctions: makeSocketFunctions(playAgain),
    playerId,
    role,
    connected: true,
    canMutate: false,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers,
    roomStatus: 'FINISHED',
    hostPlayerId: canPlayAgain ? 'player-a' : 'player-b',
    canPlayAgain,
  };
  const banner = (
    <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion }}>
      <roomExitContext.Provider value={exit}>
        <stateContext.Provider value={value}>
          <WinnerBanner />
        </stateContext.Provider>
      </roomExitContext.Provider>
    </SettingsProvider>
  );
  return store
    ? (
      <presentationStoreContext.Provider value={{ store, queue: null as unknown as AnimationQueue }}>
        {banner}
      </presentationStoreContext.Provider>
    )
    : banner;
}

const renderWinner = (options: WinnerOptions = {}) => render(winnerTree(options));

const exitContext = (overrides: Partial<RoomExitContextValue> = {}): RoomExitContextValue => ({
  requestLeave: vi.fn(),
  leaving: false,
  label: 'Rời phòng',
  ...overrides,
});

const confettiPieces = () => document.querySelectorAll('.victory-confetti__piece');

describe('getWinnerSummary', () => {
  it('counts each hotel as one hotel and zero houses', () => {
    const state = {
      boardState: {
        winner: {
          playerId: 'winner',
          name: 'Ada',
          color: 'red',
          characterId: null,
          accountBalance: 900,
        },
        ownedProps: {
          1: { id: 'winner', color: 'red', houses: 2 },
          3: { id: 'winner', color: 'red', houses: 5 },
          6: { id: 'other', color: 'blue', houses: 4 },
        },
      },
      players: { winner: { accountBalance: 1_200 } },
    } as unknown as PublicGameState;

    expect(getWinnerSummary(state)).toEqual({
      finalCash: 1_200,
      propertyCount: 2,
      houseCount: 2,
      hotelCount: 1,
    });
  });
});

describe('getOtherPlayers', () => {
  it('lists the finished and the still seated players except the winner, in seat order and without ranks', () => {
    const state = winnerState(draft => {
      draft.boardState.finishedPlayers = {
        'player-c': { teamId: 'TEAM_2', name: 'Chi', color: 'green', characterId: 'cat', reason: 'LEFT', accountBalance: 850 },
        'player-a': { teamId: 'TEAM_2', name: 'Ada', color: 'red', characterId: 'dog' },
        'player-d': { teamId: 'TEAM_1', name: 'Dũng', color: 'yellow', characterId: null },
      };
    });
    const seats = (ids: Array<[string, number]>) => ids.map(([playerId, joinOrder]) => (
      { playerId, joinOrder } as RoomPlayerMeta
    ));

    const others = getOtherPlayers(state, seats([['player-a', 0], ['player-b', 1], ['player-c', 2], ['player-d', 3]]));

    expect(others.map(player => player.playerId)).toEqual(['player-b', 'player-c', 'player-d']);
    expect(others[0]).toMatchObject({ name: 'Bình', status: null, finalCash: 1_500 });
    expect(others[1]).toMatchObject({ name: 'Chi', status: 'LEFT', finalCash: 850 });
    expect(others[2]).toMatchObject({ name: 'Dũng', status: null, finalCash: null });
  });

  it('keeps the record order for players without a seat entry and does not list a player twice', () => {
    const state = winnerState(draft => {
      draft.boardState.finishedPlayers = {
        'player-b': { teamId: 'TEAM_2', name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT', accountBalance: 0 },
      };
    });

    expect(getOtherPlayers(state).map(player => player.playerId)).toEqual(['player-b']);
    expect(getOtherPlayers(state)[0]).toMatchObject({ status: 'BANKRUPT', finalCash: 0 });
  });
});

describe('WinnerBanner', () => {
  it('renders authoritative winner facts and exposes a host-only no-payload replay command', async () => {
    const playAgain = acceptedAgain();
    renderWinner({ canPlayAgain: true, playAgain });

    expect(screen.getByRole('alertdialog', { name: 'Ván chơi kết thúc' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeTruthy();
    expect(screen.getByAltText('Mascot Chó')).toBeTruthy();
    expect(screen.queryByText('Chó')).toBeNull();
    expect(screen.getByText('1.200.000 ₫')).toBeTruthy();
    expect(screen.getByText('Chơi lại')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Chơi lại' }));
    await waitFor(() => expect(playAgain).toHaveBeenCalledTimes(1));
    expect(playAgain).toHaveBeenCalledWith();
  });

  it('shows the winner crown, colour label and the four tiles with their values', () => {
    renderWinner();

    expect(screen.getByText('Người chiến thắng')).toBeTruthy();
    expect(screen.getByText('Đỏ')).toBeTruthy();
    const tile = (label: string) => within(screen.getByText(label).closest('div') as HTMLElement);
    expect(tile('Tiền mặt cuối ván').getByText('1.200.000 ₫')).toBeTruthy();
    expect(tile('Tài sản sở hữu').getByText('2')).toBeTruthy();
    expect(tile('Nhà').getByText('2')).toBeTruthy();
    expect(tile('Khách sạn').getByText('1')).toBeTruthy();
  });

  it('lists the other players with their status and final cash, without ranks or mascot names', () => {
    const state = winnerState(draft => {
      withBankruptBinh(draft);
      draft.boardState.finishedPlayers['player-c'] = {
        teamId: 'TEAM_1',
        name: 'Chi', color: 'green', characterId: 'cat', reason: 'LEFT', accountBalance: 850,
      };
    });
    renderWinner({ state });

    const list = screen.getByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(list).getByText('Bình')).toBeTruthy();
    expect(within(list).getByText('Phá sản')).toBeTruthy();
    expect(within(list).getByText('Chi')).toBeTruthy();
    expect(within(list).getByText('Đã rời')).toBeTruthy();
    expect(within(list).getByText('850.000 ₫')).toBeTruthy();
    expect(within(list).queryByText('Ada')).toBeNull();
    // The mascot name is only an accessible label.
    expect(within(list).getByAltText('Mascot Gấu trúc')).toBeTruthy();
    expect(within(list).getByAltText('Mascot Mèo')).toBeTruthy();
    expect(screen.queryByText('Gấu trúc')).toBeNull();
    expect(document.querySelector('ol')).toBeNull();
  });

  it('gives the host both actions and sends the leave request through the room exit', () => {
    const exit = exitContext();
    renderWinner({ canPlayAgain: true, exit });

    expect(screen.getByRole('button', { name: 'Chơi lại' })).toBeTruthy();
    expect(screen.getByText('Ván mới giữ nguyên phòng và danh sách người chơi đủ điều kiện.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
    expect(exit.requestLeave).toHaveBeenCalledTimes(1);
  });

  it('puts the focus on the replay button for the host', () => {
    renderWinner({ canPlayAgain: true, exit: exitContext() });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Chơi lại' }));
  });

  it('lets a player who is not the host leave, with a waiting hint and no replay', () => {
    const exit = exitContext();
    renderWinner({ canPlayAgain: false, playerId: 'player-b', exit });

    expect(screen.queryByRole('button', { name: 'Chơi lại' })).toBeNull();
    expect(screen.getByText('Đang chờ chủ phòng bắt đầu ván mới')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
    expect(exit.requestLeave).toHaveBeenCalledTimes(1);
  });

  it('lets a spectator leave too', () => {
    const exit = exitContext();
    renderWinner({ playerId: null, role: 'SPECTATOR', exit });

    expect(screen.queryByRole('button', { name: 'Chơi lại' })).toBeNull();
    expect(screen.getByText('Đang chờ chủ phòng bắt đầu ván mới')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
    expect(exit.requestLeave).toHaveBeenCalledTimes(1);
  });

  it('has no leave button outside the app shell', () => {
    renderWinner({ canPlayAgain: true, exit: null });
    expect(screen.queryByRole('button', { name: 'Về trang chủ' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Chơi lại' })).toBeTruthy();
  });

  it('disables the leave button while a leave request is in flight', () => {
    renderWinner({ exit: exitContext({ leaving: true }) });
    const leave = screen.getByRole('button', { name: 'Về trang chủ' });
    expect(leave.hasAttribute('disabled')).toBe(true);
    expect(leave.getAttribute('aria-busy')).toBe('true');
  });

  it('shows the busy label and blocks a second replay while the command is pending', async () => {
    let settle: (ack: Ack) => void = () => undefined;
    const playAgain = vi.fn<NonNullable<SocketFunctions['playAgain']>>(
      () => new Promise<Ack>(resolve => { settle = resolve; }),
    );
    renderWinner({ canPlayAgain: true, playAgain });

    fireEvent.click(screen.getByRole('button', { name: 'Chơi lại' }));
    const busy = await screen.findByRole('button', { name: 'Đang chuẩn bị ván mới…' });
    expect(busy.hasAttribute('disabled')).toBe(true);
    fireEvent.click(busy);
    expect(playAgain).toHaveBeenCalledTimes(1);
    await act(() => {
      settle({ ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION });
      return Promise.resolve();
    });
  });

  it('localizes a failed ACK without a duplicate toast and lets the host try again', async () => {
    const playAgain = vi.fn<NonNullable<SocketFunctions['playAgain']>>(
      () => Promise.resolve({
        ok: false,
        protocolVersion: SOCKET_PROTOCOL_VERSION,
        error: { code: 'CONFLICT', message: 'The game is already resetting.', retryable: true },
      }),
    );
    renderWinner({ canPlayAgain: false, playAgain });
    expect(screen.queryByRole('button', { name: 'Chơi lại' })).toBeNull();

    cleanup();
    renderWinner({ canPlayAgain: true, playAgain });
    fireEvent.click(screen.getByRole('button', { name: 'Chơi lại' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'Không thể thực hiện hành động ở trạng thái hiện tại.',
    ));
    expect(screen.getAllByText('Không thể thực hiện hành động ở trạng thái hiện tại.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Chơi lại' }).hasAttribute('disabled')).toBe(false);
  });

  describe('keyboard and assistive technology', () => {
    it('starts a player who is not the host on the results, never on the leave button', () => {
      renderWinner({ canPlayAgain: false, playerId: 'player-b', exit: exitContext() });
      expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Kết quả ván chơi' }));
      expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Về trang chủ' }));
    });

    it('starts a spectator on the results too', () => {
      renderWinner({ playerId: null, role: 'SPECTATOR', exit: exitContext() });
      expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Kết quả ván chơi' }));
    });

    it('makes the results region a tab stop so the scrolling body can be reached by keyboard', () => {
      renderWinner({ canPlayAgain: true, exit: exitContext() });
      const region = screen.getByRole('region', { name: 'Kết quả ván chơi' });
      expect(region.getAttribute('tabindex')).toBe('0');
      // The host still starts on the primary action.
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Chơi lại' }));
    });

    it('keeps the DOM and Tab order the same as the drawn order: the primary action first', () => {
      renderWinner({ canPlayAgain: true, exit: exitContext() });
      const buttons = screen.getAllByRole('button');
      expect(buttons.map(button => button.textContent)).toEqual(['Chơi lại', 'Về trang chủ']);
    });

    it('describes the dialog with the winner and the next step', () => {
      renderWinner({ canPlayAgain: true, exit: exitContext() });
      const dialog = screen.getByRole('alertdialog', { name: 'Ván chơi kết thúc' });
      const description = (dialog.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map(id => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      expect(description).toContain('Ada');
      expect(description).toContain('Người chiến thắng');
      expect(description).toContain('Ván mới giữ nguyên phòng');
    });

    it('shows a failed leave request inside the dialog, where the toolbar message would be hidden', () => {
      renderWinner({ exit: exitContext({ error: 'Không thể rời phòng lúc này.' }) });
      const alert = within(screen.getByRole('alertdialog')).getByRole('alert');
      expect(alert.textContent).toBe('Không thể rời phòng lúc này.');
    });
  });

  describe('sizes', () => {
    it('uses the 128 px hero and large buttons on a normal screen', () => {
      renderWinner({ canPlayAgain: true, exit: exitContext() });
      const avatar = screen.getByAltText('Mascot Chó');
      expect(avatar.getAttribute('width')).toBe('128');
      expect(avatar.getAttribute('height')).toBe('128');
      expect(screen.getByRole('button', { name: 'Chơi lại' }).className).toContain('ds-button--lg');
      expect(screen.getByRole('button', { name: 'Về trang chủ' }).className).toContain('ds-button--lg');
    });

    it('shrinks the hero to 64 px and uses medium buttons on a phone held sideways', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === SHORT_VIEWPORT_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      renderWinner({ canPlayAgain: true, exit: exitContext() });
      const avatar = screen.getByAltText('Mascot Chó');
      expect(avatar.getAttribute('width')).toBe('64');
      expect(avatar.getAttribute('height')).toBe('64');
      expect(screen.getByRole('button', { name: 'Chơi lại' }).className).toContain('ds-button--md');
      expect(screen.getByRole('button', { name: 'Về trang chủ' }).className).toContain('ds-button--md');
    });
  });

  describe('when it appears', () => {
    const noWinner = () => winnerState(draft => { draft.boardState.winner = null; });

    it('waits for the presentation queue before covering the final animations', () => {
      const store = new PresentationStore();
      store.setStatus('playing');
      const view = renderWinner({ store, state: noWinner() });
      expect(screen.queryByRole('alertdialog')).toBeNull();

      view.rerender(winnerTree({ store, state: winnerState() }));
      expect(screen.queryByRole('alertdialog')).toBeNull();

      act(() => { store.setStatus('idle'); });
      expect(screen.getByRole('alertdialog', { name: 'Ván chơi kết thúc' })).toBeTruthy();
    });

    it('shows a winner that is already there on the first render even while the queue is busy', () => {
      const store = new PresentationStore();
      store.setStatus('playing');
      renderWinner({ store });
      expect(screen.getByRole('alertdialog', { name: 'Ván chơi kết thúc' })).toBeTruthy();
    });

    it('celebrates a live appearance with one confetti burst', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const store = new PresentationStore();
      const view = renderWinner({ store, state: noWinner() });
      expect(confettiPieces()).toHaveLength(0);

      view.rerender(winnerTree({ store, state: winnerState() }));
      expect(screen.getByRole('alertdialog')).toBeTruthy();
      expect(confettiPieces().length).toBeGreaterThan(0);
      expect(confettiPieces().length).toBeLessThanOrEqual(60);
      expect(document.querySelector('.victory-confetti')?.getAttribute('aria-hidden')).toBe('true');

      act(() => { vi.advanceTimersByTime(1200); });
      expect(confettiPieces()).toHaveLength(0);
      expect(screen.getByRole('alertdialog')).toBeTruthy();
    });

    it('has no confetti when the winner comes with a snapshot or reconnect', () => {
      const store = new PresentationStore();
      renderWinner({ store });
      expect(screen.getByRole('alertdialog')).toBeTruthy();
      expect(confettiPieces()).toHaveLength(0);
    });

    it('has no confetti with reduced motion, but still shows the dialog', () => {
      const store = new PresentationStore();
      const view = renderWinner({ store, state: noWinner(), reducedMotion: true });
      view.rerender(winnerTree({ store, state: winnerState(), reducedMotion: true }));
      expect(screen.getByRole('alertdialog')).toBeTruthy();
      expect(confettiPieces()).toHaveLength(0);
    });
  });
});

describe('WinnerBanner team victory', () => {
  /** An and Chi (Team 1, "Rồng") win; Bình and Dũng (Team 2, "Phượng") are the opponents. */
  function teamWin(mutate?: (state: PublicGameState) => void) {
    const room = makeTeamRoom();
    room.status = 'FINISHED';
    room.gameState.boardState.teams[0].name = 'Rồng';
    room.gameState.boardState.teams[1].name = 'Phượng';
    room.gameState.players['player-a'].accountBalance = 800;
    room.gameState.players['player-c'].accountBalance = 450;
    room.gameState.boardState.winningTeamId = 'TEAM_1';
    room.gameState.boardState.winner = {
      playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', teamId: 'TEAM_1', accountBalance: 800,
    };
    room.gameState.boardState.ownedProps = {
      1: { id: 'player-a', color: 'red', houses: 2 },
      3: { id: 'player-c', color: 'red', houses: 5 },
    };
    mutate?.(room.gameState);
    return room;
  }

  it('announces the team, both members with their mascots and the team totals', () => {
    const room = teamWin();
    renderWinner({ state: room.gameState, roomPlayers: room.players });

    expect(screen.getByRole('heading', { name: /CHIẾN THẮNG!/u })).toBeTruthy();
    expect(screen.getByText('Đội chiến thắng')).toBeTruthy();
    expect(document.querySelector('.victory__team-name')?.textContent).toContain('Rồng');
    const members = within(screen.getByRole('list', { name: 'Thành viên đội Rồng' }));
    expect(members.getByText('An')).toBeTruthy();
    expect(members.getByText('Chi')).toBeTruthy();
    expect(members.getByAltText('Mascot Chó')).toBeTruthy();
    expect(members.getByAltText('Mascot Mèo')).toBeTruthy();
    const tile = (label: string) => within(screen.getByText(label).closest('div') as HTMLElement);
    expect(tile('Tổng tiền mặt của đội').getByText('1.250.000 ₫')).toBeTruthy();
    expect(tile('Tài sản của đội').getByText('2')).toBeTruthy();
    expect(tile('Nhà').getByText('2')).toBeTruthy();
    expect(tile('Khách sạn').getByText('1')).toBeTruthy();
    expect(tile('Khu màu đủ bộ').getByText('1')).toBeTruthy();
    // The Solo "winner" wording is not used for a team.
    expect(screen.queryByText('Người chiến thắng')).toBeNull();
  });

  it('describes the dialog by the team so a screen reader hears it first', () => {
    const room = teamWin();
    renderWinner({ state: room.gameState, roomPlayers: room.players, canPlayAgain: true });
    const dialog = screen.getByRole('alertdialog', { name: 'Ván chơi kết thúc' });
    const description = (dialog.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map(id => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(description).toContain('CHIẾN THẮNG!');
    expect(description).toContain('Rồng');
    expect(description).toContain('An');
    expect(description).toContain('Chi');
  });

  it('lists a teammate who was out before the end as part of the winning team', () => {
    const room = teamWin((state) => {
      delete state.players['player-c'];
      state.boardState.finishedPlayers['player-c'] = {
        teamId: 'TEAM_1', name: 'Chi', color: 'red', characterId: 'cat', reason: 'BANKRUPT', accountBalance: 0,
      };
      state.boardState.ownedProps = { 1: { id: 'player-a', color: 'red', houses: 2 } };
    });
    renderWinner({ state: room.gameState, roomPlayers: room.players });

    const members = within(screen.getByRole('list', { name: 'Thành viên đội Rồng' }));
    expect(members.getByText('Chi')).toBeTruthy();
    expect(members.getByText('Đã phá sản trước đó')).toBeTruthy();
  });

  it('keeps only the opposing team in the "other players" list', () => {
    const room = teamWin((state) => {
      delete state.players['player-d'];
      state.boardState.finishedPlayers['player-d'] = {
        teamId: 'TEAM_2', name: 'Dũng', color: 'blue', characterId: 'duck', reason: 'BANKRUPT', accountBalance: 0,
      };
    });
    renderWinner({ state: room.gameState, roomPlayers: room.players });

    const others = within(screen.getByRole('heading', { name: 'Đội đối thủ' }).closest('section') as HTMLElement);
    expect(others.getByText('Bình')).toBeTruthy();
    expect(others.getByText('Dũng')).toBeTruthy();
    expect(others.getByText('Phá sản')).toBeTruthy();
    expect(others.queryByText('An')).toBeNull();
    expect(others.queryByText('Chi')).toBeNull();
  });

  it('still lets the host play again from a team victory', async () => {
    const playAgain = acceptedAgain();
    const room = teamWin();
    renderWinner({ state: room.gameState, roomPlayers: room.players, canPlayAgain: true, playAgain });

    fireEvent.click(screen.getByRole('button', { name: 'Chơi lại' }));
    await waitFor(() => expect(playAgain).toHaveBeenCalledTimes(1));
  });

  it('has no team podium in a Solo game', () => {
    renderWinner();
    expect(screen.queryByText('Đội chiến thắng')).toBeNull();
    expect(screen.queryByText(/CHIẾN THẮNG!/u)).toBeNull();
  });
});
