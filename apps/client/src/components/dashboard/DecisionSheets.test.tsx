import { cleanup, render, screen, within } from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import { makeRoom, makeTeamRoom } from '../../game/presentation/testFixtures';
import BuyPrompt, { groupProgressHint } from './BuyPrompt';
import DevelopmentPrompt from './DevelopmentPrompt';

afterEach(cleanup);

const socketFunctions = {
  rollDice: vi.fn(),
  buyProperty: vi.fn(),
  doNotBuy: vi.fn(),
  resolveDevelopment: vi.fn(),
  sendChat: vi.fn(),
  makeOffer: vi.fn(),
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  sellHouse: vi.fn(),
  payBail: vi.fn(),
  useJailCard: vi.fn(),
} satisfies SocketFunctions;

function context(state: PublicGameState, room = makeRoom()): StateContextValue {
  return {
    state,
    socketFunctions,
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
  };
}

function purchase(tileID: number, price: number, balance = 1500, ownedProps: PublicGameState['boardState']['ownedProps'] = {}) {
  const room = makeRoom();
  room.gameState.players['player-a'].accountBalance = balance;
  room.gameState.boardState.ownedProps = ownedProps;
  room.gameState.turnInfo.pendingLandingDecision = {
    kind: 'PURCHASE', operationId: 'purchase-1', playerId: 'player-a', tileID, price,
  };
  return room;
}

describe('buy sheet', () => {
  it('is a sheet over a clear backdrop with the deed, the price and the money math', () => {
    const room = purchase(1, 60, 1500);
    render(
      <stateContext.Provider value={context(room.gameState, room)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Mua Cà Mau?' });
    expect(dialog.className).toContain('ds-modal--sheet');
    expect((dialog.parentElement as HTMLElement).className).toContain('ds-modal__overlay--clear');
    expect(within(dialog).getByText('Ô đất trống')).toBeTruthy();
    expect(within(dialog).getByRole('article', { name: 'Cà Mau' })).toBeTruthy();
    expect(within(dialog).getByText('Số dư hiện tại').nextElementSibling?.textContent).toBe('1.500.000 ₫');
    expect(within(dialog).getByText('Số dư sau khi mua').nextElementSibling?.textContent).toBe('1.440.000 ₫');
    expect(within(dialog).queryByRole('note')).toBeNull();
    const buy = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Mua tài sản' });
    expect(buy.disabled).toBe(false);
    expect(document.activeElement).toBe(buy);
    expect(within(dialog).getByRole('button', { name: 'Không mua' })).toBeTruthy();
  });

  it('writes down why buying is disabled when the balance is short', () => {
    const room = purchase(6, 100, 80);
    render(
      <stateContext.Provider value={context(room.gameState, room)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );
    const buy = screen.getByRole<HTMLButtonElement>('button', { name: 'Mua tài sản' });
    expect(buy.disabled).toBe(true);
    expect(screen.getByRole('note').textContent).toBe('Bạn còn thiếu 20.000 ₫ để mua ô đất này.');
    expect(screen.getByText('Số dư sau khi mua').nextElementSibling?.textContent).toBe('−20.000 ₫');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Không mua' }).disabled).toBe(false);
  });

  it('allows an exact-balance purchase', () => {
    const room = purchase(1, 60, 60);
    render(
      <stateContext.Provider value={context(room.gameState, room)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Mua tài sản' }).disabled).toBe(false);
    expect(screen.getByText('Số dư sau khi mua').nextElementSibling?.textContent).toBe('0 ₫');
  });

  it('stays closed until the token has arrived', () => {
    const room = purchase(1, 60);
    render(
      <stateContext.Provider value={context(room.gameState, room)}>
        <BuyPrompt tokenArrived={false} />
      </stateContext.Provider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says how far the purchase brings a group, only when that is worth saying', () => {
    expect(groupProgressHint(3, 'player-a', { 1: { id: 'player-a' } })).toBe('Hoàn thành nhóm nâu sau khi mua');
    expect(groupProgressHint(3, 'player-a', {})).toBeNull();
    expect(groupProgressHint(6, 'player-a', { 8: { id: 'player-a' } })).toBe('Sở hữu 2/3 ô trong nhóm xanh nhạt sau khi mua');
    expect(groupProgressHint(6, 'player-a', { 8: { id: 'player-b' } })).toBeNull();
    expect(groupProgressHint(5, 'player-a', {})).toBeNull();
    expect(groupProgressHint(3, undefined, { 1: { id: 'player-a' } })).toBeNull();
  });
});

describe('development sheet', () => {
  function development(kind: 'DEVELOP_HOUSES' | 'UPGRADE_HOTEL', balance: number, houses: number) {
    const room = makeRoom();
    room.gameState.players['player-a'].accountBalance = balance;
    room.gameState.boardState.ownedProps = {
      1: { id: 'player-a', color: 'red', houses },
      3: { id: 'player-a', color: 'red', houses },
    };
    room.gameState.turnInfo.pendingLandingDecision = {
      kind, operationId: 'develop-1', playerId: 'player-a', tileID: 1, unitCost: 50, maxQuantity: kind === 'DEVELOP_HOUSES' ? 3 : 1,
    };
    return room;
  }

  it('shows the deed with the level in force and the next one, and the cost of each option', () => {
    const room = development('DEVELOP_HOUSES', 1000, 1);
    render(
      <stateContext.Provider value={context(room.gameState, room)}>
        <DevelopmentPrompt tokenArrived />
      </stateContext.Provider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Phát triển Cà Mau' });
    expect(dialog.className).toContain('ds-modal--sheet');
    const table = within(dialog).getByRole('table', { name: 'Bảng giá thuê' });
    expect(within(table).getAllByRole('row').find(row => row.getAttribute('aria-current') === 'true')?.textContent)
      .toContain('Có 1 Nhà');
    expect(within(table).getByText('Sau khi xây').closest('tr')?.textContent).toContain('Có 2 Nhà');
    const one = within(dialog).getByRole('button', { name: 'Xây 1 Nhà (50.000 ₫)' });
    // Drawn as two short lines (what, then the cost) so the label fits a narrow phone button.
    expect(one.querySelector('.decision-sheet__option')?.textContent).toBe('Xây 1 Nhà50.000 ₫');
    expect(within(dialog).getByRole('button', { name: 'Xây 3 Nhà (150.000 ₫)' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Bỏ qua' })).toBeTruthy();
    expect(within(dialog).queryByRole('note')).toBeNull();
  });

  it('explains why the larger options are disabled', () => {
    const room = development('DEVELOP_HOUSES', 120, 0);
    render(
      <stateContext.Provider value={context(room.gameState, room)}>
        <DevelopmentPrompt tokenArrived />
      </stateContext.Provider>,
    );
    expect(screen.getByRole('note').textContent).toBe('Số dư chỉ đủ xây tối đa 2 Nhà.');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Xây 2 Nhà (100.000 ₫)' }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Xây 3 Nhà (150.000 ₫)' }).disabled).toBe(true);
  });

  it('says how much is missing when not even one house is affordable, and for the hotel', () => {
    const none = development('DEVELOP_HOUSES', 30, 0);
    const { unmount } = render(
      <stateContext.Provider value={context(none.gameState, none)}>
        <DevelopmentPrompt tokenArrived />
      </stateContext.Provider>,
    );
    expect(screen.getByRole('note').textContent).toBe('Bạn còn thiếu 20.000 ₫ để xây 1 Nhà.');
    unmount();

    const hotel = development('UPGRADE_HOTEL', 10, 4);
    render(
      <stateContext.Provider value={context(hotel.gameState, hotel)}>
        <DevelopmentPrompt tokenArrived />
      </stateContext.Provider>,
    );
    expect(screen.getByRole('note').textContent).toBe('Bạn còn thiếu 40.000 ₫ để nâng cấp Khách sạn.');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Nâng cấp Khách sạn (50.000 ₫)' }).disabled).toBe(true);
  });
});

describe('2v2 decision sheets', () => {
  it('counts a teammate\'s streets toward the group and speaks of the whole team', () => {
    expect(groupProgressHint(3, 'player-a', { 1: { id: 'player-c' } }, ['player-c'])).toBe('Cả đội hoàn thành nhóm nâu sau khi mua');
    expect(groupProgressHint(6, 'player-a', { 8: { id: 'player-c' } }, ['player-c'])).toBe('Cả đội sở hữu 2/3 ô trong nhóm xanh nhạt sau khi mua');
    // A street an opponent holds does not count for the team.
    expect(groupProgressHint(3, 'player-a', { 1: { id: 'player-b' } }, ['player-c'])).toBeNull();
    // Solo wording is unchanged.
    expect(groupProgressHint(3, 'player-a', { 1: { id: 'player-a' } })).toBe('Hoàn thành nhóm nâu sau khi mua');
  });

  it('Team Investment: says the lander pays, whose street it stays and that the owner is refunded on a sale', () => {
    const room = makeTeamRoom();
    room.gameState.players['player-a'].accountBalance = 1000;
    room.gameState.boardState.ownedProps = {
      1: { id: 'player-c', color: 'red', houses: 1 },
      3: { id: 'player-c', color: 'red', houses: 0 },
    };
    room.gameState.turnInfo.pendingLandingDecision = {
      kind: 'DEVELOP_HOUSES', operationId: 'develop-1', playerId: 'player-a', tileID: 1, unitCost: 50, maxQuantity: 3,
    };
    render(
      <stateContext.Provider value={context(room.gameState, room)}>
        <DevelopmentPrompt tokenArrived />
      </stateContext.Provider>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Đầu tư Cà Mau' });
    expect(within(dialog).getByText('Đầu tư cho đồng đội')).toBeTruthy();
    expect(dialog.textContent).toContain('Bạn trả bằng tiền của mình. Cà Mau vẫn thuộc về Chi, và Chi nhận lại tiền nếu sau này bán công trình.');
    expect(dialog.textContent).toContain('Đội Team 1 · đồng đội của bạn');
    expect(within(dialog).getByRole('button', { name: 'Xây 1 Nhà (50.000 ₫)' })).toBeTruthy();
  });

  it('keeps the ordinary copy for a street the lander owns, even in 2v2', () => {
    const room = makeTeamRoom();
    room.gameState.players['player-a'].accountBalance = 1000;
    room.gameState.boardState.ownedProps = {
      1: { id: 'player-a', color: 'red', houses: 1 },
      3: { id: 'player-a', color: 'red', houses: 0 },
    };
    room.gameState.turnInfo.pendingLandingDecision = {
      kind: 'DEVELOP_HOUSES', operationId: 'develop-1', playerId: 'player-a', tileID: 1, unitCost: 50, maxQuantity: 3,
    };
    render(
      <stateContext.Provider value={context(room.gameState, room)}>
        <DevelopmentPrompt tokenArrived />
      </stateContext.Provider>,
    );

    expect(screen.getByRole('dialog', { name: 'Phát triển Cà Mau' })).toBeTruthy();
    expect(screen.queryByText('Đầu tư cho đồng đội')).toBeNull();
  });
});
