import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type { Ack, PublicGameState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import { makeTeamRoom } from '../../game/presentation/testFixtures';
import type { SocketFunctions, StateContextValue } from '../../types';
import DebtPanel from './DebtPanel';
import { RESCUE_DECLINE_CONSEQUENCE } from './RescuePanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const success: Ack = { ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION };

/** An (Team 1) owes Bình (Team 2) 300 and owns nothing to sell: Chi, An's teammate, is asked to cover it. */
function rescueState(rescuerBalance = 600): PublicGameState {
  const state = makeTeamRoom().gameState;
  state.players['player-a'].accountBalance = 0;
  state.players['player-c'].accountBalance = rescuerBalance;
  state.boardState.currentPlayer = { id: 'player-a', hasMoved: true };
  const expiresAt = new Date(Date.now() + 30_000).toISOString();
  state.boardState.paymentShortfall = {
    debtorPlayerId: 'player-a',
    creditor: 'PLAYER',
    creditorPlayerId: 'player-b',
    amount: 300,
    remainingAmount: 300,
    source: { kind: 'RENT', tileID: 6 },
    actionDeadlineAt: expiresAt,
    remainingClaimCount: 1,
    paymentOperationId: '00000000-0000-4000-8000-000000000001',
    claimId: '00000000-0000-4000-8000-000000000002',
    sellableProperties: [],
    rescue: {
      rescueId: 'rescue-1', debtorPlayerId: 'player-a', rescuerPlayerId: 'player-c', amount: 300, expiresAt,
    },
  };
  return state;
}

function renderAs(playerId: string, state: PublicGameState, socketFunctions: Partial<SocketFunctions> = {}) {
  const value: StateContextValue = {
    state,
    playerId,
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
      ...socketFunctions,
    },
  };
  return render(
    <stateContext.Provider value={value}>
      <DebtPanel />
    </stateContext.Provider>,
  );
}

describe('Emergency Rescue', () => {
  it('asks the teammate to cover the debt: amount, who is paid, what they keep and what declining costs', () => {
    renderAs('player-c', rescueState());

    const dialog = screen.getByRole('alertdialog', { name: 'Hỗ trợ đồng đội' });
    expect(within(dialog).getByText('Cứu trợ khẩn cấp')).toBeTruthy();
    expect(within(dialog).getByText('Số tiền hỗ trợ').nextElementSibling?.textContent).toBe('300.000 ₫');
    expect(within(dialog).getByText('Trả cho').nextElementSibling?.textContent).toBe('Bình');
    expect(within(dialog).getByText('Tiền mặt của bạn').nextElementSibling?.textContent).toBe('600.000 ₫');
    expect(within(dialog).getByText('Sau khi hỗ trợ').nextElementSibling?.textContent).toBe('300.000 ₫');
    expect(dialog.textContent).toContain('không chuyển vào ví của An');
    expect(dialog.textContent).toContain(RESCUE_DECLINE_CONSEQUENCE);
    expect(within(dialog).getByRole('button', { name: 'Hỗ trợ đồng đội — 300.000 ₫' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Không hỗ trợ' })).toBeTruthy();
    // The debtor's own sale screen is never shown to the rescuer.
    expect(screen.queryByText('Cần thanh toán')).toBeNull();
  });

  it('sends only the offer id when the teammate accepts', async () => {
    const acceptRescue = vi.fn(() => Promise.resolve(success));
    renderAs('player-c', rescueState(), { acceptRescue });

    fireEvent.click(screen.getByRole('button', { name: 'Hỗ trợ đồng đội — 300.000 ₫' }));

    await waitFor(() => expect(acceptRescue).toHaveBeenCalledWith('rescue-1'));
    expect(acceptRescue).toHaveBeenCalledTimes(1);
    // While the answer is in flight neither button can be pressed again.
    expect(screen.getByRole('button', { name: 'Không hỗ trợ' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Đang gửi quyết định…');
  });

  it('sends the decline with the same offer id', async () => {
    const declineRescue = vi.fn(() => Promise.resolve(success));
    const acceptRescue = vi.fn();
    renderAs('player-c', rescueState(), { declineRescue, acceptRescue });

    fireEvent.click(screen.getByRole('button', { name: 'Không hỗ trợ' }));

    await waitFor(() => expect(declineRescue).toHaveBeenCalledWith('rescue-1'));
    expect(acceptRescue).not.toHaveBeenCalled();
  });

  it('shows a refused answer in the dialog and lets the teammate try again', async () => {
    const acceptRescue = vi.fn(() => Promise.resolve({
      ok: false,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      error: { code: 'CONFLICT', message: 'Lời đề nghị hỗ trợ không còn hiệu lực.', retryable: true },
    } satisfies Ack));
    renderAs('player-c', rescueState(), { acceptRescue });

    fireEvent.click(screen.getByRole('button', { name: 'Hỗ trợ đồng đội — 300.000 ₫' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Lời đề nghị hỗ trợ không còn hiệu lực.'));
    expect(screen.getByRole('button', { name: 'Hỗ trợ đồng đội — 300.000 ₫' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps the accept button off when the teammate\'s cash no longer covers the amount, and says so', () => {
    renderAs('player-c', rescueState(250));

    expect(screen.getByRole('button', { name: 'Hỗ trợ đồng đội — 300.000 ₫' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Bạn cần 300.000 ₫ để hỗ trợ.');
    expect(screen.getByRole('button', { name: 'Không hỗ trợ' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows the debtor who is deciding instead of a sale screen', () => {
    renderAs('player-a', rescueState());

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Bạn hết tài sản để bán. Đang chờ Chi quyết định hỗ trợ');
    expect(screen.getByRole('status').textContent).toContain('trả thẳng cho Bình');
    expect(screen.getByRole('timer').textContent).toMatch(/\d+:\d{2} còn lại/u);
  });

  it('tells the other players who is short and who is deciding', () => {
    renderAs('player-b', rescueState());

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('An hết tài sản để bán, đang chờ Chi quyết định hỗ trợ');
  });

  it('falls back to the ordinary sale dialog when no rescue is open', () => {
    const state = rescueState();
    state.boardState.paymentShortfall!.rescue = null;
    renderAs('player-a', state);

    expect(screen.getByRole('alertdialog', { name: 'Cần thanh toán' })).toBeTruthy();
  });
});
