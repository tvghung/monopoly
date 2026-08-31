import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import tradePromptContext from '../../../tradePromptContext';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { makeRoom } from '../../presentation/testFixtures';
import PropertyInspectionModal from './PropertyInspectionModal';

afterEach(cleanup);

const socketFunctions = {
  rollDice: vi.fn(), buyProperty: vi.fn(), sendChat: vi.fn(), makeOffer: vi.fn(),
  acceptOffer: vi.fn(), declineOffer: vi.fn(), sellHouse: vi.fn(), payBail: vi.fn(),
  useJailCard: vi.fn(),
} satisfies SocketFunctions;

function renderInspection(tileId: number, ownedProps: StateContextValue['state']['boardState']['ownedProps']) {
  const state = makeRoom().gameState;
  state.boardState.ownedProps = ownedProps;
  const openTradeForProperty = vi.fn();
  render(
    <stateContext.Provider value={{
      state,
      socketFunctions,
      playerId: 'player-a',
      role: 'PLAYER',
      connected: true,
      canMutate: true,
      privatePlayerState: null,
      privateOffers: [],
    }}>
      <tradePromptContext.Provider value={{
        tradeTarget: null,
        openTradeForProperty,
        closeTrade: vi.fn(),
      }}>
        <PropertyInspectionModal tileId={tileId} onClose={vi.fn()} />
      </tradePromptContext.Provider>
    </stateContext.Provider>,
  );
  return openTradeForProperty;
}

describe('PropertyInspectionModal', () => {
  it('keeps the current street facts above a collapsed rent ladder', () => {
    renderInspection(1, { 1: { id: 'player-a', color: 'red', houses: 2 } });

    expect(screen.getByText('Giá mua: 60.000 ₫')).toBeTruthy();
    expect(screen.getByText('Phát triển: 2 Nhà')).toBeTruthy();
    expect(document.querySelector('.property-inspection__detail--current')?.textContent).toContain('30.000 ₫');
    const disclosure = screen.getByText('Xem bảng giá thuê').closest('details');
    expect(disclosure?.open).toBe(false);
    fireEvent.click(screen.getByText('Xem bảng giá thuê'));
    expect(disclosure?.open).toBe(true);
    expect(screen.getByText('Có Khách Sạn')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bán Nhà' })).toBeTruthy();
  });

  it('shows the current portfolio rule and preserves the opponent trade action', () => {
    const openTradeForProperty = renderInspection(5, {
      5: { id: 'player-b', color: 'blue', houses: 0 },
      15: { id: 'player-b', color: 'blue', houses: 0 },
    });

    expect(document.querySelector('.property-inspection__detail--current')?.textContent).toContain('Sở hữu 2 Ga Tàu');
    expect(document.querySelector('.property-inspection__detail--current')?.textContent).toContain('50.000 ₫');
    fireEvent.click(screen.getByRole('button', { name: 'Đề nghị mua' }));
    expect(openTradeForProperty).toHaveBeenCalledWith(5);
  });

  it('summarizes the current utility multiplier before its full table', () => {
    renderInspection(12, {
      12: { id: 'player-b', color: 'blue', houses: 0 },
      28: { id: 'player-b', color: 'blue', houses: 0 },
    });

    expect(document.querySelector('.property-inspection__detail--current')?.textContent).toContain('Sở hữu cả 2 Công Ty');
    expect(document.querySelector('.property-inspection__detail--current')?.textContent).toContain('Tổng xúc xắc ×10');
  });
});
