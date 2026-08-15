import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../internal';
import type { SocketFunctions, StateContextValue } from '../types';
import Board from './Board';

afterEach(cleanup);

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

  it('keeps bilateral trade available for another player property', () => {
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
    expect(screen.getByRole('button', { name: 'Đề nghị mua' })).toBeTruthy();
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
