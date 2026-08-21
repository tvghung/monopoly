import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { SOCKET_PROTOCOL_VERSION, type Ack, type PlayerColorId, type PublicGameState } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../internal';
import type { SocketFunctions, StateContextValue } from '../types';
import { presentationContext } from '../game/presentation/PresentationProvider';
import type { PresentationState } from '../game/presentation/store/types';
import type { AnimationQueue } from '../game/presentation/queue/AnimationQueue';
import Board from './Board';

vi.mock('../game/scene/GameScene', () => ({
  default: () => <div data-testid="game-scene" />,
}));

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

const makePlayer = (name: string, color: PlayerColorId): PublicGameState['players'][string] => ({
  name,
  currentTile: 0,
  color,
  characterId: 'dog',
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
      rollSequence: 0,
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
    connected?: boolean;
    socketFunctions?: SocketFunctions;
  } = {},
): StateContextValue => ({
  state,
  socketFunctions: options.socketFunctions ?? makeSocketFunctions(),
  playerId: options.playerId ?? null,
  role: options.role ?? 'SPECTATOR',
  connected: options.connected ?? true,
  canMutate: options.canMutate ?? false,
  privatePlayerState: null,
  privateOffers: [],
});

const makePresentationState = (overrides: Partial<PresentationState> = {}): PresentationState => ({
  displayPositions: {},
  settledPositions: {},
  displayActivePlayerId: null,
  displayDice: { dice1: 0, dice2: 0 },
  displayRollSequence: 0,
  diceRoll: null,
  status: 'idle',
  tileImpacts: [],
  characterMovements: [],
  characterLandings: [],
  characterReactions: [],
  animationSpeedMultiplier: 1,
  presentationResetEpoch: 0,
  ...overrides,
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

    expect(container.querySelector('.game-board__renderer')?.getAttribute('data-renderer-mode'))
      .toBe('legacy');
    expect(container.querySelector('.legacy-board')).toBeTruthy();
    expect(container.querySelector('.game-board__accessibility-layer')).toBeNull();
    expect(container.querySelector('[data-testid="game-scene"]')).toBeNull();

    const tile = screen.getByRole('button', { name: /Ô 1: Cà Mau/ });
    expect(tile.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the board full-width and layers gameplay controls over the renderer', () => {
    const { container } = render(
      <stateContext.Provider value={makeContextValue()}>
        <Board />
      </stateContext.Provider>,
    );

    const renderer = container.querySelector('.game-board__renderer');

    expect(renderer).toBeTruthy();
    expect(container.querySelector('.game-board__left-rail')).toBeNull();
    expect(container.querySelector('.game-board__right-rail')).toBeNull();
    expect(container.querySelector('.gameplay-action-layer')).toBeTruthy();
    expect(container.querySelector('.player-hud')).toBeTruthy();
    expect(container.querySelector('[data-testid="roll-control"]')).toBeTruthy();
    expect(container.querySelectorAll('.dice')).toHaveLength(0);
    expect(renderer?.querySelectorAll('.center__room')).toHaveLength(1);
    expect(container.querySelectorAll('.center__room')).toHaveLength(1);
    expect(container.querySelector('.game-board__center-ui, .game-board__ui, .center')).toBeNull();
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

  it('opens owned properties as a separate access path before inspection', async () => {
    const state = makeGameState({
      players: { me: makePlayer('An', 'red') },
      ownedProps: { 1: { id: 'me', color: 'blue', houses: 0 } },
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

    fireEvent.click(screen.getByRole('button', { name: 'Tài sản của tôi (1)' }));
    expect(screen.getByRole('dialog', { name: 'Tài sản của tôi' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Cà Mau$/ }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Cà Mau' })).toBeTruthy();
    });
  });

  it('locks the Roll CTA immediately and releases it on authoritative progression', async () => {
    const state = makeGameState({
      players: { me: makePlayer('An', 'red') },
      currentPlayerId: 'me',
    });
    const socketFunctions = makeSocketFunctions();
    const pendingRoll: SocketFunctions['rollDice'] = () => new Promise<Ack>(() => {});
    socketFunctions.rollDice = vi.fn(pendingRoll);

    const view = render(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );

    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Đổ Xúc Xắc' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(socketFunctions.rollDice).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Đang chờ máy chủ…' })).toBe(button);

    const progressed = {
      ...state,
      boardState: {
        ...state.boardState,
        diceValue: { dice1: 2, dice2: 3 },
        rollSequence: 1,
      },
    };
    view.rerender(
      <stateContext.Provider value={makeContextValue(progressed, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đổ Xúc Xắc' }).disabled).toBe(false);
    });
  });

  it('releases the Roll CTA and surfaces a localized ACK failure', async () => {
    const state = makeGameState({
      players: { me: makePlayer('An', 'red') },
      currentPlayerId: 'me',
    });
    const socketFunctions = makeSocketFunctions();
    socketFunctions.rollDice = vi.fn((): Promise<Ack> => Promise.resolve({
      ok: false,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      error: {
        code: 'FORBIDDEN',
        message: 'forbidden',
        retryable: false,
      },
    }));

    render(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đổ Xúc Xắc' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Bạn không có quyền thực hiện hành động này.');
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đổ Xúc Xắc' }).disabled).toBe(false);
    });
  });

  it('clears a pre-ACK lock on disconnect and waits for an explicit retry after reconnect', async () => {
    const state = makeGameState({
      players: { me: makePlayer('An', 'red') },
      currentPlayerId: 'me',
    });
    const socketFunctions = makeSocketFunctions();
    socketFunctions.rollDice = vi.fn(() => new Promise<Ack>(() => {}));
    const view = render(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đổ Xúc Xắc' }));
    expect(socketFunctions.rollDice).toHaveBeenCalledTimes(1);

    view.rerender(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        connected: false,
        socketFunctions,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );
    view.rerender(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        connected: true,
        socketFunctions,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đổ Xúc Xắc' }).disabled).toBe(false);
    });
    expect(socketFunctions.rollDice).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Đổ Xúc Xắc' }));
    expect(socketFunctions.rollDice).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate a committed roll when reconnect supplies a higher sequence', async () => {
    const state = makeGameState({
      players: { me: makePlayer('An', 'red') },
      currentPlayerId: 'me',
    });
    const socketFunctions = makeSocketFunctions();
    socketFunctions.rollDice = vi.fn(() => new Promise<Ack>(() => {}));
    const view = render(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đổ Xúc Xắc' }));
    const committed = {
      ...state,
      boardState: {
        ...state.boardState,
        diceValue: { dice1: 4, dice2: 2 },
        rollSequence: 1,
        currentPlayer: { id: 'me', hasMoved: true },
      },
    };
    view.rerender(
      <stateContext.Provider value={makeContextValue(committed, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <Board />
      </stateContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đổ Xúc Xắc' }).disabled).toBe(true);
    });
    expect(socketFunctions.rollDice).toHaveBeenCalledTimes(1);
  });

  it('clears stale Roll state when the presentation session reset epoch changes', async () => {
    const state = makeGameState({
      players: { me: makePlayer('An', 'red') },
      currentPlayerId: 'me',
    });
    const socketFunctions = makeSocketFunctions();
    socketFunctions.rollDice = vi.fn(() => new Promise<Ack>(() => {}));
    const view = render(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <presentationContext.Provider value={{
          state: makePresentationState(),
          queue: null as unknown as AnimationQueue,
        }}
        >
          <Board />
        </presentationContext.Provider>
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đổ Xúc Xắc' }));
    view.rerender(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <presentationContext.Provider value={{
          state: makePresentationState({ presentationResetEpoch: 1 }),
          queue: null as unknown as AnimationQueue,
        }}
        >
          <Board />
        </presentationContext.Provider>
      </stateContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đổ Xúc Xắc' }).disabled).toBe(false);
    });
    expect(socketFunctions.rollDice).toHaveBeenCalledTimes(1);
  });

  it('clears a stale Roll error when the presentation session reset epoch changes', async () => {
    const state = makeGameState({
      players: { me: makePlayer('An', 'red') },
      currentPlayerId: 'me',
    });
    const socketFunctions = makeSocketFunctions();
    socketFunctions.rollDice = vi.fn((): Promise<Ack> => Promise.resolve({
      ok: false,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      error: {
        code: 'FORBIDDEN',
        message: 'forbidden',
        retryable: false,
      },
    }));
    const view = render(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <presentationContext.Provider value={{
          state: makePresentationState(),
          queue: null as unknown as AnimationQueue,
        }}
        >
          <Board />
        </presentationContext.Provider>
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đổ Xúc Xắc' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    view.rerender(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'me',
        role: 'PLAYER',
        canMutate: true,
        socketFunctions,
      })}
      >
        <presentationContext.Provider value={{
          state: makePresentationState({ presentationResetEpoch: 1 }),
          queue: null as unknown as AnimationQueue,
        }}
        >
          <Board />
        </presentationContext.Provider>
      </stateContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('keeps the turn label and player strip on the presentation player while Roll permission stays authoritative', () => {
    const state = makeGameState({
      players: {
        a: makePlayer('An', 'red'),
        b: makePlayer('Bình', 'blue'),
      },
      currentPlayerId: 'b',
    });

    const view = render(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'b',
        role: 'PLAYER',
        canMutate: true,
      })}
      >
        <presentationContext.Provider value={{
          state: makePresentationState({
            displayActivePlayerId: 'a',
            displayPositions: { a: 0, b: 0 },
            settledPositions: { a: 0, b: 0 },
          }),
          queue: null as unknown as AnimationQueue,
        }}
        >
          <Board />
        </presentationContext.Provider>
      </stateContext.Provider>,
    );

    expect(screen.getByText('An đang chơi')).toBeTruthy();
    expect(document.querySelector('[data-player-id="a"]')?.className).toContain('player-card--active');
    expect(document.querySelector('[data-player-id="b"]')?.className).not.toContain('player-card--active');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đổ Xúc Xắc' }).disabled).toBe(false);

    view.rerender(
      <stateContext.Provider value={makeContextValue(state, {
        playerId: 'b',
        role: 'PLAYER',
        canMutate: true,
      })}
      >
        <presentationContext.Provider value={{
          state: makePresentationState({
            displayActivePlayerId: 'b',
            displayPositions: { a: 0, b: 0 },
            settledPositions: { a: 0, b: 0 },
          }),
          queue: null as unknown as AnimationQueue,
        }}
        >
          <Board />
        </presentationContext.Provider>
      </stateContext.Provider>,
    );

    expect(screen.queryByText('An đang chơi')).toBeNull();
    expect(screen.getByText('Lượt của bạn')).toBeTruthy();
    expect(document.querySelector('[data-player-id="b"]')?.className).toContain('player-card--active');
  });
});
