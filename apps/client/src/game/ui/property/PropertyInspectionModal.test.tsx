import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { tileState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import tradePromptContext from '../../../tradePromptContext';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { makeRoom } from '../../presentation/testFixtures';
import PropertyInspectionModal from './PropertyInspectionModal';
import { getTileDetails } from './propertyDetails';

afterEach(cleanup);

type OwnedProps = StateContextValue['state']['boardState']['ownedProps'];

function makeSocketFunctions() {
  return {
    rollDice: vi.fn(), buyProperty: vi.fn(), sendChat: vi.fn(), makeOffer: vi.fn(),
    acceptOffer: vi.fn(), declineOffer: vi.fn(), sellHouse: vi.fn(), payBail: vi.fn(),
    useJailCard: vi.fn(),
  } satisfies SocketFunctions;
}

function withContexts(
  ownedProps: OwnedProps,
  options: { canMutate?: boolean } = {},
) {
  const room = makeRoom();
  room.gameState.boardState.ownedProps = ownedProps;
  const socketFunctions = makeSocketFunctions();
  const openTradeForProperty = vi.fn();
  const wrap = (children: React.ReactNode) => (
    <stateContext.Provider value={{
      state: room.gameState,
      socketFunctions,
      playerId: 'player-a',
      role: 'PLAYER',
      connected: true,
      canMutate: options.canMutate ?? true,
      privatePlayerState: null,
      privateOffers: [],
      roomPlayers: room.players,
    }}>
      <tradePromptContext.Provider value={{ tradeTarget: null, openTradeForProperty, closeTrade: vi.fn() }}>
        {children}
      </tradePromptContext.Provider>
    </stateContext.Provider>
  );
  return { wrap, socketFunctions, openTradeForProperty };
}

function renderInspection(
  tileId: number | null,
  ownedProps: OwnedProps = {},
  options: { canMutate?: boolean; onClose?: () => void } = {},
) {
  const contexts = withContexts(ownedProps, options);
  const onClose = options.onClose ?? vi.fn();
  const view = render(contexts.wrap(<PropertyInspectionModal tileId={tileId} onClose={onClose} />));
  return { ...contexts, onClose, view };
}

const currentRow = () => document.querySelector('.property-inspection__detail--current');

describe('PropertyInspectionModal', () => {
  it('shows a street as a full deed: price, development, the rent ladder with the current tier, and the owner', () => {
    renderInspection(1, { 1: { id: 'player-a', color: 'red', houses: 2 } });

    const dialog = screen.getByRole('dialog', { name: 'Cà Mau' });
    const deed = within(dialog).getByRole('article', { name: 'Cà Mau' });
    expect(deed.className).toContain('deed--full');
    expect(within(deed).getByText('Giá mua').nextElementSibling?.textContent).toBe('60.000 ₫');
    expect(within(deed).getByText('Phát triển').nextElementSibling?.textContent).toBe('2 Nhà');
    expect(currentRow()?.textContent).toContain('Có 2 Nhà');
    expect(currentRow()?.textContent).toContain('30.000 ₫');
    expect(currentRow()?.getAttribute('aria-current')).toBe('true');
    const ladder = within(deed).getByRole('table', { name: 'Bảng giá thuê' });
    expect(within(ladder).getByText('Có Khách Sạn')).toBeTruthy();
    expect(deed.querySelector('.deed__owner')?.textContent).toContain('An');
    // The collapsed <details> ladder and the one-line "Giá mua: X" texts are gone: the deed prints them as rows.
    expect(dialog.querySelector('details')).toBeNull();
    expect(screen.queryByText(/^Giá mua:/u)).toBeNull();
    expect(screen.queryByText('Xem bảng giá thuê')).toBeNull();
  });

  it('shows the current portfolio rule of a railroad and preserves the opponent trade action', () => {
    const { openTradeForProperty } = renderInspection(5, {
      5: { id: 'player-b', color: 'blue', houses: 0 },
      15: { id: 'player-b', color: 'blue', houses: 0 },
    });

    expect(screen.getByRole('article', { name: 'Ga Hà Nội' }).className).toContain('deed--railroad');
    expect(currentRow()?.textContent).toContain('Sở hữu 2 Ga Tàu');
    expect(currentRow()?.textContent).toContain('50.000 ₫');
    fireEvent.click(screen.getByRole('button', { name: 'Đề nghị mua' }));
    expect(openTradeForProperty).toHaveBeenCalledWith(5);
  });

  it('summarizes the current utility multiplier in its ladder', () => {
    renderInspection(12, {
      12: { id: 'player-b', color: 'blue', houses: 0 },
      28: { id: 'player-b', color: 'blue', houses: 0 },
    });

    expect(currentRow()?.textContent).toContain('Sở hữu cả 2 Công Ty');
    expect(currentRow()?.textContent).toContain('Tổng xúc xắc ×10');
  });

  it('says so when a street has no owner and offers no action', () => {
    renderInspection(1);

    expect(document.querySelector('.deed__owner-name--none')?.textContent).toBe('Chưa có chủ');
    expect(screen.queryByRole('button', { name: 'Đề nghị mua' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bán Nhà' })).toBeNull();
  });

  it.each([
    [0, 'Xuất Phát'],
    [2, 'Khí Vận'],
    [4, 'Thuế Thu Nhập'],
    [7, 'Cơ Hội'],
    [10, 'Nhà Tù / Thăm Tù'],
    [20, 'Bãi Đỗ Xe'],
    [30, 'Vào Tù'],
  ])('shows tile %i (%s) as a rule card built from getTileDetails, with no price, ladder or actions', (tileId, name) => {
    renderInspection(tileId);

    const dialog = screen.getByRole('dialog', { name });
    const card = within(dialog).getByRole('article', { name });
    expect(card.className).toContain('deed--special');
    const rule = getTileDetails(tileState[tileId])[0].label;
    expect(within(card).getByText(rule)).toBeTruthy();
    expect(within(card).queryByRole('table')).toBeNull();
    expect(within(card).queryByText('Giá mua')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Đề nghị mua|Bán Nhà/u })).toBeNull();
  });

  it('prints what a tax tile costs, from the shared tile value', () => {
    renderInspection(4);
    expect(screen.getByText(/^Nộp 200\.000 ₫ cho Ngân hàng/u)).toBeTruthy();
  });

  describe('actions', () => {
    it('lets the owner sell a house back to the bank', () => {
      const { socketFunctions } = renderInspection(1, { 1: { id: 'player-a', color: 'red', houses: 2 } });

      const sell = screen.getByRole('button', { name: 'Bán Nhà' });
      expect(sell.hasAttribute('disabled')).toBe(false);
      expect(sell.getAttribute('title')).toBe('Bán một Nhà về Ngân hàng');
      fireEvent.click(sell);
      expect(socketFunctions.sellHouse).toHaveBeenCalledWith(1);
      expect(screen.queryByRole('button', { name: 'Đề nghị mua' })).toBeNull();
    });

    it('disables "Bán Nhà" with a written reason when there is no house to sell', () => {
      const { socketFunctions } = renderInspection(1, { 1: { id: 'player-a', color: 'red', houses: 0 } });

      const sell = screen.getByRole('button', { name: 'Bán Nhà' });
      expect(sell.hasAttribute('disabled')).toBe(true);
      expect(sell.getAttribute('title')).toBe('Tài sản không có Nhà để bán');
      expect(screen.getByRole('note').textContent).toBe('Tài sản không có Nhà để bán.');
      fireEvent.click(sell);
      expect(socketFunctions.sellHouse).not.toHaveBeenCalled();
    });

    it('offers nothing on a railroad the viewer owns', () => {
      renderInspection(5, { 5: { id: 'player-a', color: 'red', houses: 0 } });

      expect(screen.queryByRole('button', { name: 'Bán Nhà' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Đề nghị mua' })).toBeNull();
    });

    it('offers no action to a viewer who cannot act (spectator or a blocked room)', () => {
      renderInspection(1, { 1: { id: 'player-b', color: 'blue', houses: 1 } }, { canMutate: false });

      expect(screen.getByRole('article', { name: 'Cà Mau' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Đề nghị mua' })).toBeNull();
    });
  });

  describe('closing', () => {
    it('renders nothing while no tile is selected', () => {
      renderInspection(null);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.querySelector('.ds-modal__card')).toBeNull();
    });

    it('closes with the Đóng button, Escape and a click outside, but not a click inside', () => {
      const { onClose } = renderInspection(1);
      const dialog = screen.getByRole('dialog', { name: 'Cà Mau' });

      fireEvent.mouseDown(within(dialog).getByRole('article'));
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(2);

      fireEvent.mouseDown(dialog.parentElement as HTMLElement);
      expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('keeps showing the same tile while it animates out, then leaves the DOM', async () => {
      const contexts = withContexts({});
      const view = render(contexts.wrap(<PropertyInspectionModal tileId={1} onClose={vi.fn()} />));
      expect(screen.getByRole('dialog', { name: 'Cà Mau' })).toBeTruthy();

      view.rerender(contexts.wrap(<PropertyInspectionModal tileId={null} onClose={vi.fn()} />));
      // Out of the accessibility tree at once, still painted for the 200 ms exit.
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.querySelector('.ds-modal__card')?.textContent).toContain('Cà Mau');
      await waitFor(() => expect(document.querySelector('.ds-modal__card')).toBeNull());
    });

    it('returns focus to the control that opened it', async () => {
      const contexts = withContexts({});
      function Harness() {
        const [tileId, setTileId] = useState<number | null>(null);
        return (
          <>
            <button type="button" data-tile-index="1" onClick={() => setTileId(1)}>Ô 1</button>
            <PropertyInspectionModal tileId={tileId} onClose={() => setTileId(null)} />
          </>
        );
      }
      render(contexts.wrap(<Harness />));
      const tile = screen.getByRole('button', { name: 'Ô 1' });
      tile.focus();
      fireEvent.click(tile);
      expect(screen.getByRole('dialog', { name: 'Cà Mau' })).toBeTruthy();

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(document.activeElement).toBe(tile));
    });
  });
});
