import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import type { SocketFunctions, StateContextValue } from '../../../types';
import OwnedPropertiesControl from './OwnedPropertiesControl';

const playerId = 'player-a';

const socketFunctions = {
  rollDice: vi.fn(), buyProperty: vi.fn(), sendChat: vi.fn(), makeOffer: vi.fn(),
  acceptOffer: vi.fn(), declineOffer: vi.fn(), sellHouse: vi.fn(), payBail: vi.fn(),
  useJailCard: vi.fn(),
} satisfies SocketFunctions;

function makeState(balance: number, includePlayer = true): PublicGameState {
  return {
    boardState: {
      gameStarted: true,
      players: includePlayer ? [playerId, 'player-b', 'player-c', 'player-d'] : ['player-b'],
      finishedPlayers: {},
      currentPlayer: { id: playerId, hasMoved: false },
      turnNumber: 1,
      turnRecovery: null,
      logs: [],
      diceValue: { dice1: 0, dice2: 0 },
      rollSequence: 0,
      gameplayEvents: { sequence: 0, events: [] },
      activityFeed: { sequence: 0, events: [] },
      ownedProps: includePlayer
        ? {
          1: { id: playerId, color: 'red', houses: 2 },
          5: { id: playerId, color: 'red', houses: 0 },
          12: { id: 'player-b', color: 'blue', houses: 0 },
        }
        : {},
      winner: null,
    },
    players: includePlayer
      ? {
        [playerId]: {
          name: 'An', currentTile: 0, color: 'red', characterId: 'dog', accountBalance: balance,
          isJail: false, jailOpponentRoundsElapsed: 0, getOutOfJailCardCount: 0,
        },
        'player-b': {
          name: 'Bình', currentTile: 0, color: 'blue', characterId: 'panda', accountBalance: 900,
          isJail: false, jailOpponentRoundsElapsed: 0, getOutOfJailCardCount: 0,
        },
      }
      : {},
    turnInfo: {},
    deckCounts: { chance: 16, chest: 16 },
    loaded: true,
  };
}

function context(state: PublicGameState): StateContextValue {
  return {
    state,
    socketFunctions,
    playerId,
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
  };
}

function openControl(state: PublicGameState, onSelect = vi.fn()) {
  render(
    <stateContext.Provider value={context(state)}>
      <OwnedPropertiesControl onSelect={onSelect} />
    </stateContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Tài sản của tôi \(\d+\)$/u }));
  return { onSelect, dialog: screen.getByRole('dialog', { name: 'Tài sản của tôi' }) };
}

/** Real property tiles: a special tile (tax, chance, jail ...) can never be owned. */
const PROPERTY_TILES = [1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39, 5, 15, 25, 35, 12, 28];

describe('OwnedPropertiesControl', () => {
  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.visualTheme;
  });

  it('shows authoritative balance, owned count, group identity, development, and inspect actions', async () => {
    const onSelect = vi.fn();
    render(
      <stateContext.Provider value={context(makeState(1_250))}>
        <OwnedPropertiesControl onSelect={onSelect} />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tài sản của tôi (2)' }));
    expect(screen.getByText('Số dư hiện tại')).toBeTruthy();
    expect(screen.getByText('1.250.000 ₫')).toBeTruthy();
    expect(screen.getByText('2 tài sản')).toBeTruthy();
    expect(screen.getByText('2 nhà')).toBeTruthy();
    expect(screen.getByText('0 khách sạn')).toBeTruthy();
    // Each district is a named group holding compact deeds (the old "Nhóm Nâu · 2 Nhà" line is the deed's own rows now).
    const brown = screen.getByRole('group', { name: 'Nhóm Nâu' });
    expect(within(brown).getByRole('article', { name: 'Cà Mau' })).toBeTruthy();
    expect(within(brown).getByText('Có 2 Nhà')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Ga tàu' })).getByRole('article', { name: 'Ga Hà Nội' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xem Cà Mau' }));
    expect(onSelect).toHaveBeenCalledWith(1);
    // The dialog animates out (200 ms) before it leaves the DOM.
    await waitFor(() => expect(screen.queryByText('Số dư hiện tại')).toBeNull());
  });

  it('updates a zero/current balance while open and disappears after player removal', () => {
    const view = render(
      <stateContext.Provider value={context(makeState(0))}>
        <OwnedPropertiesControl onSelect={vi.fn()} />
      </stateContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tài sản của tôi (2)' }));
    expect(screen.getByText('0 ₫')).toBeTruthy();

    view.rerender(
      <stateContext.Provider value={context(makeState(725))}>
        <OwnedPropertiesControl onSelect={vi.fn()} />
      </stateContext.Provider>,
    );
    expect(screen.getByText('725.000 ₫')).toBeTruthy();

    view.rerender(
      <stateContext.Provider value={context(makeState(0, false))}>
        <OwnedPropertiesControl onSelect={vi.fn()} />
      </stateContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: /Tài sản của tôi/u })).toBeNull();
  });

  it('shows the balance and an empty state when the player owns no properties', () => {
    const state = makeState(350);
    state.boardState.ownedProps = {};
    render(
      <stateContext.Provider value={context(state)}>
        <OwnedPropertiesControl onSelect={vi.fn()} />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tài sản của tôi (0)' }));
    expect(screen.getByText('350.000 ₫')).toBeTruthy();
    expect(screen.getByText('0 tài sản')).toBeTruthy();
    expect(screen.getByText('Bạn chưa sở hữu tài sản nào.')).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('keeps the trigger name "Tài sản của tôi (N)" with the short label for phones', () => {
    render(
      <stateContext.Provider value={context(makeState(1_250))}>
        <OwnedPropertiesControl onSelect={vi.fn()} />
      </stateContext.Provider>,
    );
    const trigger = screen.getByRole('button', { name: 'Tài sản của tôi (2)' });
    expect(trigger.querySelector('.dock-label--long')?.textContent).toBe('Tài sản của tôi');
    expect(trigger.querySelector('.dock-label--short')?.textContent).toBe('Tài sản');
  });

  it('groups the deeds by district in board order and counts tài sản, nhà and khách sạn', () => {
    document.documentElement.dataset.visualTheme = 'v2';
    const state = makeState(1_000);
    state.boardState.ownedProps = {
      28: { id: playerId, color: 'red', houses: 0 },
      15: { id: playerId, color: 'red', houses: 0 },
      8: { id: playerId, color: 'red', houses: 1 },
      1: { id: playerId, color: 'red', houses: 4 },
      3: { id: playerId, color: 'red', houses: 5 },
      6: { id: playerId, color: 'red', houses: 0 },
      5: { id: playerId, color: 'red', houses: 0 },
      9: { id: 'player-b', color: 'blue', houses: 3 },
    };
    const { dialog } = openControl(state);

    const groups = within(dialog).getAllByRole('group');
    expect(groups).toHaveLength(4);
    expect(groups.map(group => within(group).getAllByRole('article').length)).toEqual([2, 2, 2, 1]);
    expect(groups.map(group => group.querySelector('.portfolio-group__label')?.textContent))
      .toEqual(['Nhóm Nâu', 'Nhóm Xanh nhạt', 'Ga tàu', 'Tiện ích']);
    // 7 of the viewer's own tiles: houses 4 + 1, one hotel; the other player's tile 9 is not counted or shown.
    expect(within(dialog).getByText('7 tài sản')).toBeTruthy();
    expect(within(dialog).getByText('5 nhà')).toBeTruthy();
    expect(within(dialog).getByText('1 khách sạn')).toBeTruthy();
    expect(within(dialog).queryByRole('article', { name: 'Hải Phòng' })).toBeNull();
    // Two of two brown tiles: the whole district, said in words as well as by the group count.
    expect(within(groups[0]).getByText('2/2 ô')).toBeTruthy();
    expect(within(groups[0]).getByText('Đủ nhóm')).toBeTruthy();
    expect(within(groups[1]).getByText('2/3 ô')).toBeTruthy();
    expect(within(groups[1]).queryByText('Đủ nhóm')).toBeNull();
  });

  it('gives every deed a "Xem <tile>" button that keeps the inspect behavior and the list-item hook class', () => {
    const { dialog, onSelect } = openControl(makeState(500));

    const items = dialog.querySelectorAll('.owned-properties-list__item');
    expect(items).toHaveLength(2);
    items.forEach(item => {
      expect(item.querySelector('button')?.getAttribute('aria-label')).toMatch(/^Xem /u);
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xem Ga Hà Nội' }));
    expect(onSelect).toHaveBeenCalledWith(5);
  });

  it('keeps a large authoritative inventory reachable in one modal', () => {
    const state = makeState(900);
    state.boardState.ownedProps = Object.fromEntries(
      PROPERTY_TILES.slice(0, 20).map(tileId => [tileId, {
        id: playerId,
        color: 'red' as const,
        houses: 0,
      }]),
    );
    const { dialog } = openControl(state);

    expect(screen.getByRole('button', { name: 'Tài sản của tôi (20)' })).toBeTruthy();
    expect(dialog.querySelectorAll('.owned-properties-list__item')).toHaveLength(20);
    expect(within(dialog).getAllByRole('button', { name: /^Xem / })).toHaveLength(20);
    expect(within(dialog).getByText('20 tài sản')).toBeTruthy();
  });
});
