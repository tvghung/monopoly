import { cleanup, render, screen } from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import type { StateContextValue } from '../../../types';
import { makeRoom, makeTeamRoom } from '../../presentation/testFixtures';
import TileOwnerHoverCard from './TileOwnerHoverCard';

afterEach(cleanup);

function renderCard(state: PublicGameState, tileId: number | null, viewerPlayerId = 'player-a') {
  const value: StateContextValue = {
    state,
    playerId: viewerPlayerId,
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    socketFunctions: {
      rollDice: vi.fn(),
      buyProperty: vi.fn(),
      sendChat: vi.fn(),
      makeOffer: vi.fn(),
      acceptOffer: vi.fn(),
      declineOffer: vi.fn(),
      sellHouse: vi.fn(),
      payBail: vi.fn(),
      useJailCard: vi.fn(),
    },
  };
  return render(
    <stateContext.Provider value={value}>
      <TileOwnerHoverCard tileId={tileId} />
    </stateContext.Provider>,
  );
}

describe('TileOwnerHoverCard', () => {
  it('names the owner, their team and how they relate to the viewer in a 2v2 game', () => {
    const state = makeTeamRoom().gameState;
    state.boardState.ownedProps = { 1: { id: 'player-c', color: 'red', houses: 0 } };
    renderCard(state, 1);

    const card = screen.getByTestId('tile-owner-hover');
    expect(card.textContent).toContain('Cà Mau');
    expect(card.textContent).toContain('Chủ sở hữu: Chi');
    expect(card.textContent).toContain('Đội Team 1 · Đồng đội');
    expect(card.getAttribute('aria-hidden')).toBe('true');
    expect(card.getAttribute('data-hud-transient')).toBe('true');
  });

  it('marks an opponent\'s street as such', () => {
    const state = makeTeamRoom().gameState;
    state.boardState.ownedProps = { 3: { id: 'player-b', color: 'blue', houses: 0 } };
    renderCard(state, 3);
    expect(screen.getByTestId('tile-owner-hover').textContent).toContain('Đội Team 2 · Đối thủ');
  });

  it('is not drawn in Solo, for an unowned tile or with nothing hovered', () => {
    const solo = makeRoom().gameState;
    solo.boardState.ownedProps = { 1: { id: 'player-a', color: 'red', houses: 0 } };
    const { unmount } = renderCard(solo, 1);
    expect(screen.queryByTestId('tile-owner-hover')).toBeNull();
    unmount();

    const team = makeTeamRoom().gameState;
    const unowned = renderCard(team, 1);
    expect(screen.queryByTestId('tile-owner-hover')).toBeNull();
    unowned.unmount();

    team.boardState.ownedProps = { 1: { id: 'player-a', color: 'red', houses: 0 } };
    renderCard(team, null);
    expect(screen.queryByTestId('tile-owner-hover')).toBeNull();
  });
});
