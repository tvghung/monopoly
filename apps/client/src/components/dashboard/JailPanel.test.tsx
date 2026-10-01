import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import type { Ack, PublicGameState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import { makeRoom } from '../../game/presentation/testFixtures';
import JailPanel from './JailPanel';

afterEach(cleanup);

const success: Ack = { ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION };

function jailedState(options: { balance?: number; cards?: number; rounds?: number; turnOf?: string } = {}): PublicGameState {
  const room = makeRoom();
  const player = room.gameState.players['player-a'];
  player.isJail = true;
  player.accountBalance = options.balance ?? 1500;
  player.getOutOfJailCardCount = options.cards ?? 0;
  player.jailOpponentRoundsElapsed = options.rounds ?? 0;
  room.gameState.boardState.currentPlayer = { id: options.turnOf ?? 'player-a', hasMoved: false };
  return room.gameState;
}

function renderJail(state: PublicGameState, socketFunctions: Partial<SocketFunctions> = {}, context: Partial<StateContextValue> = {}) {
  const value: StateContextValue = {
    state,
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
      ...socketFunctions,
    },
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    ...context,
  };
  return render(
    <stateContext.Provider value={value}>
      <JailPanel />
    </stateContext.Provider>,
  );
}

describe('JailPanel', () => {
  it('is a status sheet with the jail icon, the title, the wait as a chip and the hint', () => {
    const { container } = renderJail(jailedState({ rounds: 1 }));

    const panel = screen.getByRole('status');
    expect(panel.classList.contains('jail-panel')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Bạn đang ở Nhà Tù' })).toBeTruthy();
    expect(container.querySelector('.jail-panel__icon svg')).not.toBeNull();
    const rounds = container.querySelector('.jail-panel__rounds');
    expect(rounds?.classList.contains('ds-chip')).toBe(true);
    expect(rounds?.textContent).toBe('Vòng chờ: 1/2');
    expect(screen.getByText('Chọn một cách ra tù, hoặc bấm Đổ xúc xắc để thử đổ đôi.')).toBeTruthy();
  });

  it('uses design-system buttons for bail and the Get Out Of Jail Free card', () => {
    const { container } = renderJail(jailedState({ cards: 2 }));

    const bail = screen.getByRole('button', { name: 'Trả 25.000 ₫' });
    const card = screen.getByRole('button', { name: 'Dùng thẻ Thoát Tù Miễn Phí (2)' });
    for (const button of [bail, card]) {
      expect(button.classList.contains('ds-button--secondary')).toBe(true);
      expect(button.querySelector('.ds-button__icon svg')).not.toBeNull();
    }
    expect(container.querySelector('.button__purchase--yes')).toBeNull();
  });

  it('offers the card only when one is held', () => {
    renderJail(jailedState({ cards: 0 }));

    expect(screen.queryByRole('button', { name: /Dùng thẻ Thoát Tù Miễn Phí/ })).toBeNull();
  });

  it('spends the card once and locks both actions while it is in flight', async () => {
    let resolveCard!: (response: Ack) => void;
    const useJailCard = vi.fn(() => new Promise<Ack>(resolve => { resolveCard = resolve; }));
    const payBail = vi.fn();
    renderJail(jailedState({ cards: 1 }), { useJailCard, payBail });

    const card = screen.getByRole('button', { name: 'Dùng thẻ Thoát Tù Miễn Phí (1)' });
    fireEvent.click(card);
    fireEvent.click(card);
    expect(useJailCard).toHaveBeenCalledTimes(1);
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.textContent).toBe('Đang gửi…');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Trả 25.000 ₫' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Trả 25.000 ₫' }));
    expect(payBail).not.toHaveBeenCalled();

    act(() => { resolveCard(success); });
    await waitFor(() => expect(card.textContent).toBe('Đang cập nhật…'));
    expect(screen.getByText('Đã xác nhận. Đang cập nhật ván chơi…')).toBeTruthy();
  });

  it('keeps the balance warning and disabled bail below the canonical amount, but still offers the card', () => {
    renderJail(jailedState({ balance: 10, cards: 1 }));

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Trả 25.000 ₫' }).disabled).toBe(true);
    expect(screen.getByText('Cần 25.000 ₫ để trả bảo lãnh.')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Dùng thẻ Thoát Tù Miễn Phí (1)' }).disabled).toBe(false);
  });

  it('shows a thrown request as one alert and unlocks the action', async () => {
    const payBail = vi.fn(() => Promise.reject(new Error('offline')));
    renderJail(jailedState(), { payBail });

    const bail = screen.getByRole('button', { name: 'Trả 25.000 ₫' });
    fireEvent.click(bail);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Không thể gửi thao tác. Vui lòng thử lại.'));
    expect(bail.hasAttribute('disabled')).toBe(false);
  });

  it.each([
    ['it is not their turn', jailedState({ turnOf: 'player-b' }), {}],
    ['the client cannot send commands', jailedState(), { canMutate: false }],
    ['they are not in jail', (() => { const state = jailedState(); state.players['player-a'].isJail = false; return state; })(), {}],
  ])('renders nothing when %s', (_reason, state, context) => {
    const { container } = renderJail(state, {}, context);

    expect(container.querySelector('.jail-panel')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
