import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Board from '../../../components/Board';
import stateContext from '../../../internal';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { makeRoom } from '../../presentation/testFixtures';

vi.mock('../../scene/GameScene', () => ({
  default: () => <div data-testid="game-scene" />,
}));

afterEach(cleanup);

const socketFunctions = {
  rollDice: vi.fn(), buyProperty: vi.fn(), sendChat: vi.fn(), makeOffer: vi.fn(),
  acceptOffer: vi.fn(), declineOffer: vi.fn(), sellHouse: vi.fn(), payBail: vi.fn(),
  useJailCard: vi.fn(),
} satisfies SocketFunctions;

function renderBoard() {
  const room = makeRoom();
  room.gameState.boardState.ownedProps = {
    1: { id: 'player-b', color: 'blue', houses: 2 },
    12: { id: 'player-a', color: 'red', houses: 0 },
  };
  const value: StateContextValue = {
    state: room.gameState,
    socketFunctions,
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
  };
  return render(
    <stateContext.Provider value={value}>
      <Board />
    </stateContext.Provider>,
  );
}

describe('opening a player\'s portfolio from the board', () => {
  it('opens the read-only portfolio from the player card and hands a deed to the inspection dialog', async () => {
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Xem tài sản của Bình' }));
    const portfolio = screen.getByRole('dialog', { name: 'Tài sản của Bình' });
    expect(within(portfolio).getByRole('article', { name: 'Cà Mau' })).toBeTruthy();

    fireEvent.click(within(portfolio).getByRole('button', { name: 'Xem Cà Mau' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Tài sản của Bình' })).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Cà Mau' })).toBeTruthy();
    });
    // One dialog at a time, and the inspection dialog offers the ordinary trade action for the other player's street.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Đề nghị mua' })).toBeTruthy();
  });

  it('returns focus to the player card button when the portfolio is dismissed', async () => {
    renderBoard();
    const button = screen.getByRole('button', { name: 'Xem tài sản của Bình' });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Tài sản của Bình' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(button);
    });
  });

  it('opens the viewer\'s own portfolio from their own card without any extra action', () => {
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Xem tài sản của An' }));
    const portfolio = screen.getByRole('dialog', { name: 'Tài sản của An' });
    expect(within(portfolio).getByRole('article', { name: 'Công Ty Điện' })).toBeTruthy();
  });
});
