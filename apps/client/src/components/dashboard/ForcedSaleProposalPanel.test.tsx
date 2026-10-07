import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type { Ack, ForcedSaleProposal, PrivatePlayerState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import { makeRoom } from '../../game/presentation/testFixtures';
import ForcedSaleProposalPanel from './ForcedSaleProposalPanel';

afterEach(cleanup);

const failure: Ack = {
  ok: false,
  protocolVersion: SOCKET_PROTOCOL_VERSION,
  error: { code: 'CONFLICT', message: 'The proposal changed.', retryable: true },
};

function proposal(): ForcedSaleProposal {
  return {
    proposalId: '00000000-0000-4000-8000-000000000003',
    paymentOperationId: '00000000-0000-4000-8000-000000000001',
    claimId: '00000000-0000-4000-8000-000000000002',
    sellerPlayerId: 'player-a',
    buyerPlayerId: 'player-b',
    tileID: 1,
    grossPrice: 112,
    expectedHouses: 2,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function renderPanel(
  playerId: string,
  socketFunctions: Partial<SocketFunctions> = {},
  options: { forcedSaleProposal?: ForcedSaleProposal | null; canMutate?: boolean } = {},
) {
  const room = makeRoom();
  const privatePlayerState: PrivatePlayerState = {
    playerId,
    heldJailFreeCardIds: [],
    gameplayEvents: { sequence: 0, events: [] },
    forcedSaleProposal: options.forcedSaleProposal === undefined ? proposal() : options.forcedSaleProposal,
  };
  const value: StateContextValue = {
    state: room.gameState,
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
    playerId,
    role: 'PLAYER',
    connected: true,
    canMutate: options.canMutate ?? true,
    privatePlayerState,
    privateOffers: [],
    roomPlayers: room.players,
  };
  return render(
    <stateContext.Provider value={value}>
      <ForcedSaleProposalPanel />
    </stateContext.Provider>,
  );
}

describe('ForcedSaleProposalPanel', () => {
  it('shows the deed, the price and both parties', () => {
    renderPanel('player-b');

    const dialog = screen.getByRole('dialog', { name: 'Đề nghị bán bắt buộc' });
    expect(dialog.querySelector('.deed--compact')).not.toBeNull();
    expect(within(dialog).getByRole('heading', { name: 'Cà Mau' })).toBeTruthy();
    expect(within(dialog).getByText('Giá bán').nextElementSibling?.textContent).toBe('112.000 ₫');
    expect(within(dialog).getByText('Người bán').nextElementSibling?.textContent).toBe('An');
    expect(within(dialog).getByText('Người mua').nextElementSibling?.textContent).toBe('Bình');
  });

  it('lets the buyer accept exactly once and focuses the accept button', () => {
    const acceptForcedSale = vi.fn(() => new Promise<Ack>(() => {}));
    renderPanel('player-b', { acceptForcedSale });

    const accept = screen.getByRole('button', { name: 'Chấp nhận' });
    expect(document.activeElement).toBe(accept);
    fireEvent.click(accept);
    fireEvent.click(accept);

    expect(acceptForcedSale).toHaveBeenCalledTimes(1);
    expect(acceptForcedSale).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000003');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Từ chối' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Hủy đề nghị' })).toBeNull();
  });

  it('lets the buyer refuse', () => {
    const rejectForcedSale = vi.fn();
    renderPanel('player-b', { rejectForcedSale });

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

    expect(rejectForcedSale).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000003');
  });

  it('makes the seller wait for the buyer and lets them cancel', () => {
    const rejectForcedSale = vi.fn();
    const acceptForcedSale = vi.fn();
    renderPanel('player-a', { rejectForcedSale, acceptForcedSale });

    expect(screen.getByText('Đang chờ Bình phản hồi.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Chấp nhận' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy đề nghị' }));

    expect(rejectForcedSale).toHaveBeenCalledTimes(1);
    expect(rejectForcedSale).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000003');
    expect(acceptForcedSale).not.toHaveBeenCalled();
  });

  it('unlocks the buttons and shows one localized error after a failed ACK', async () => {
    renderPanel('player-b', { acceptForcedSale: vi.fn(() => Promise.resolve(failure)) });

    const accept = screen.getByRole('button', { name: 'Chấp nhận' });
    fireEvent.click(accept);

    await waitFor(() => expect(accept.hasAttribute('disabled')).toBe(false));
    expect(screen.getByRole('alert').textContent).toBe('Giao dịch chưa thể thực hiện.');
  });

  it('is hidden for other players, without a proposal, and while commands cannot be sent', () => {
    const other = renderPanel('player-c');
    expect(screen.queryByRole('dialog')).toBeNull();
    other.unmount();

    const none = renderPanel('player-b', {}, { forcedSaleProposal: null });
    expect(screen.queryByRole('dialog')).toBeNull();
    none.unmount();

    renderPanel('player-b', {}, { canMutate: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
