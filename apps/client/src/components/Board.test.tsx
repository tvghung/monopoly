import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../internal';
import { supportsWebGL } from '../game/scene/fallback/webglSupport';
import type { SocketFunctions, StateContextValue } from '../types';
import Board from './Board';

vi.mock('../game/scene/fallback/webglSupport', () => ({
  supportsWebGL: vi.fn(() => false),
}));
vi.mock('../game/scene/GameScene', () => ({
  default: () => <div data-testid="game-scene" />,
}));

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(supportsWebGL).mockReturnValue(false);
});

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

const makePlayer = (name: string, color: string): PublicGameState['players'][string] => ({
  name,
  currentTile: 0,
  color,
  accountBalance: 1500,
  isJail: false,
  jailOpponentRoundsElapsed: 0,
  getOutOfJailCardCount: 0,
});

const makeGameState = (options: {
  players?: PublicGameState['players'];
  ownedProps?: PublicGameState['boardState']['ownedProps'];
  currentPlayerId?: string;
} = {}): PublicGameState => {
  const players = options.players ?? {};
  return {
    boardState: {
      gameStarted: true,
      players: Object.keys(players),
      finishedPlayers: {},
      turnNumber: 1,
      currentPlayer: { id: options.currentPlayerId ?? '', hasMoved: false },
      turnRecovery: null,
      logs: [],
      diceValue: { dice1: 0, dice2: 0 },
      ownedProps: options.ownedProps ?? {},
      winner: null,
    },
    players,
    turnInfo: {},
    deckCounts: { chance: 16, chest: 16 },
    loaded: true,
  };
};

const makeContextValue = (
  state: PublicGameState = makeGameState(),
  options: {
    playerId?: string | null;
    role?: StateContextValue['role'];
    canMutate?: boolean;
  } = {},
): StateContextValue => ({
  state,
  socketFunctions: makeSocketFunctions(),
  playerId: options.playerId ?? null,
  role: options.role ?? 'SPECTATOR',
  connected: true,
  canMutate: options.canMutate ?? false,
  privatePlayerState: null,
  privateOffers: [],
});

describe('Vietnamese game board', () => {
  it('renders exactly 40 canonical tiles as keyboard-accessible controls', () => {
    const { container } = render(
      <stateContext.Provider value={makeContextValue()}>
        <Board />
      </stateContext.Provider>,
    );

    expect(container.querySelectorAll('[data-tile-index]')).toHaveLength(40);
    expect(screen.getByRole('button', { name: /Ô 0: Xuất Phát/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ô 39: Landmark 81.*400\.000 ₫/ })).toBeTruthy();
  });

  it('uses the legacy board when WebGL is unavailable and keeps selection visible', () => {
    const { container } = render(
      <stateContext.Provider value={makeContextValue()}>
        <Board />
      </stateContext.Provider>,
    );

    expect(container.querySelector('.legacy-board')).toBeTruthy();
    expect(container.querySelector('[data-testid="game-scene"]')).toBeNull();

    const tile = screen.getByRole('button', { name: /Ô 1: Cà Mau/ });
    expect(tile.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps one HUD instance in side rails while the WebGL renderer owns the center', async () => {
    vi.mocked(supportsWebGL).mockReturnValue(true);
    const { container } = render(
      <stateContext.Provider value={makeContextValue()}>
        <Board />
      </stateContext.Provider>,
    );

    await waitFor(() => expect(container.querySelector('[data-testid="game-scene"]')).toBeTruthy());
    const leftRail = container.querySelector('.game-board__left-rail');
    const renderer = container.querySelector('.game-board__renderer');
    const rightRail = container.querySelector('.game-board__right-rail');

    expect(leftRail?.querySelectorAll('.dice')).toHaveLength(1);
    expect(leftRail?.querySelectorAll('.center__dashboard--container')).toHaveLength(1);
    expect(rightRail?.querySelectorAll('.center__room')).toHaveLength(1);
    expect(container.querySelectorAll('.dice')).toHaveLength(1);
    expect(container.querySelectorAll('.center__dashboard--container')).toHaveLength(1);
    expect(container.querySelectorAll('.center__room')).toHaveLength(1);
    expect(renderer?.querySelector('.dice, .center__dashboard--container, .center__room')).toBeNull();
    expect(container.querySelector('.game-board__center-ui, .game-board__ui, .center')).toBeNull();
    expect(container.querySelector('.legacy-board')).toBeNull();
    expect(container.querySelectorAll('[data-tile-index]')).toHaveLength(40);
  });

  it('opens derived property details and closes them with Escape', async () => {
    render(
      <stateContext.Provider value={makeContextValue()}>
        <Board />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ô 1: Cà Mau/ }));
    expect(screen.getByRole('dialog', { name: 'Cà Mau' })).toBeTruthy();
    expect(screen.getByText('Có Khách Sạn')).toBeTruthy();
    expect(screen.getByText('250.000 ₫')).toBeTruthy();
    expect(screen.queryByText('Giá trị cầm cố')).toBeNull();
    expect(screen.queryByText('Đang cầm cố')).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Cà Mau' })).toBeNull();
      expect(document.activeElement?.getAttribute('data-tile-index')).toBe('1');
    });
  });

  it('does not render removed property actions for the current owner', () => {
    const state = makeGameState({
      players: {
        me: makePlayer('An', 'red'),
        them: makePlayer('Bình', 'blue'),
      },
      ownedProps: {
        1: { id: 'me', color: 'blue', houses: 1 },
      },
      currentPlayerId: 'me',
    });

    render(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ô 1: Cà Mau/ }));
    expect(screen.getByRole('dialog', { name: 'Cà Mau' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cầm cố' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chuộc tài sản' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đăng bán' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bán Nhà' })).toBeTruthy();
  });

  it('hands property inspection to one bilateral trade modal without restoring tile focus', async () => {
    const state = makeGameState({
      players: {
        me: makePlayer('An', 'red'),
        them: makePlayer('Bình', 'blue'),
      },
      ownedProps: {
        1: { id: 'them', color: 'blue', houses: 0 },
      },
      currentPlayerId: 'me',
    });

    render(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ô 1: Cà Mau/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Đề nghị mua' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Cà Mau' })).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Giao dịch với Bình' })).toBeTruthy();
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(document.activeElement?.id).toBe('private-offer-cash');
    });
  });

  it('does not render the removed public marketplace', () => {
    render(
      <stateContext.Provider value={makeContextValue()}>
        <Board />
      </stateContext.Provider>,
    );

    expect(screen.queryByText('Thị trường tài sản')).toBeNull();
  });
});
