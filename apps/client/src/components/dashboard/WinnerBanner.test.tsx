import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import type { Ack, PublicGameState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import { makeRoom } from '../../game/presentation/testFixtures';
import { getWinnerSummary } from './WinnerBanner';
import WinnerBanner from './WinnerBanner';

afterEach(() => cleanup());

function winnerState(): PublicGameState {
  const room = makeRoom();
  room.status = 'FINISHED';
  room.gameState.players['player-a'] = {
    ...room.gameState.players['player-a'],
    name: 'Wrong live name',
    accountBalance: 1_200,
  };
  room.gameState.boardState.winner = {
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
  return room.gameState;
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

function renderWinner(canPlayAgain: boolean, playAgain: SocketFunctions['playAgain']) {
  const value: StateContextValue = {
    state: winnerState(),
    socketFunctions: makeSocketFunctions(playAgain),
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: false,
    privatePlayerState: null,
    privateOffers: [],
    roomStatus: 'FINISHED',
    hostPlayerId: canPlayAgain ? 'player-a' : 'player-b',
    canPlayAgain,
  };
  return render(
    <stateContext.Provider value={value}>
      <WinnerBanner />
    </stateContext.Provider>,
  );
}

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

  it('renders authoritative winner facts and exposes a host-only no-payload replay command', async () => {
    const playAgain = vi.fn<NonNullable<SocketFunctions['playAgain']>>(
      () => Promise.resolve({ ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION } satisfies Ack),
    );
    renderWinner(true, playAgain);

    expect(screen.getByRole('heading', { name: 'Ada' })).toBeTruthy();
    expect(screen.getByAltText('Mascot Dog')).toBeTruthy();
    expect(screen.queryByText('Dog')).toBeNull();
    expect(screen.getByText('1.200.000 ₫')).toBeTruthy();
    expect(screen.getByText('Chơi lại')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Chơi lại' }));
    await waitFor(() => expect(playAgain).toHaveBeenCalledTimes(1));
    expect(playAgain).toHaveBeenCalledWith();
  });

  it('hides replay for non-hosts and localizes a failed ACK without a duplicate toast', async () => {
    const playAgain = vi.fn<NonNullable<SocketFunctions['playAgain']>>(
      () => Promise.resolve({
        ok: false,
        protocolVersion: SOCKET_PROTOCOL_VERSION,
        error: { code: 'CONFLICT', message: 'The game is already resetting.', retryable: true },
      }),
    );
    renderWinner(false, playAgain);
    expect(screen.queryByRole('button', { name: 'Chơi lại' })).toBeNull();

    cleanup();
    renderWinner(true, playAgain);
    fireEvent.click(screen.getByRole('button', { name: 'Chơi lại' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'Không thể thực hiện hành động ở trạng thái hiện tại.',
    ));
    expect(screen.getAllByText('Không thể thực hiện hành động ở trạng thái hiện tại.')).toHaveLength(1);
  });
});
