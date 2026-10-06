import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Ack, PublicGameState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import { makeRoom, makeTeamRoom } from '../../game/presentation/testFixtures';
import type { SocketFunctions, StateContextValue } from '../../types';
import RevivePanel from './RevivePanel';

afterEach(cleanup);

const success: Ack = { ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION };

/** Dũng (Team 2) is bankrupt and Bình, his teammate and the survivor, is on turn with the window open since an earlier turn. */
function reviveState(turnsRemaining = 3): PublicGameState {
  const state = makeTeamRoom().gameState;
  delete state.players['player-d'];
  state.boardState.players = ['player-a', 'player-b', 'player-c'];
  state.boardState.finishedPlayers['player-d'] = {
    teamId: 'TEAM_2', name: 'Dũng', color: 'blue', characterId: 'duck', reason: 'BANKRUPT', accountBalance: 0,
  };
  state.boardState.teamPlay.reviveWindows = [{
    playerId: 'player-d', teamId: 'TEAM_2', survivorPlayerId: 'player-b', turnsRemaining, openedAtTurnNumber: 1,
  }];
  state.boardState.turnNumber = 3;
  state.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
  state.players['player-b'].accountBalance = 1_000;
  return state;
}

function renderAs(
  playerId: string,
  state: PublicGameState,
  socketFunctions: Partial<SocketFunctions> = {},
  canMutate = true,
) {
  const value: StateContextValue = {
    state,
    playerId,
    role: 'PLAYER',
    connected: true,
    canMutate,
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
      <RevivePanel />
    </stateContext.Provider>,
  );
}

describe('RevivePanel', () => {
  it('offers the survivor the revive with the price, what the teammate returns with and the turns left', () => {
    renderAs('player-b', reviveState(3));

    const panel = screen.getByRole('region', { name: 'Có thể hồi sinh: Dũng' });
    expect(panel.textContent).toContain('Còn 3 lượt');
    expect(panel.textContent).toContain('Trả 750.000 ₫ cho Ngân hàng');
    expect(panel.textContent).toContain('Dũng trở lại Xuất Phát với 300.000 ₫');
    expect(panel.textContent).toContain('mỗi người chỉ hồi sinh một lần');
    const button = screen.getByRole('button', { name: 'Hồi sinh Dũng — 750.000 ₫' });
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it.each([
    [2, 'Còn 2 lượt'],
    [1, 'Cơ hội cuối'],
  ])('shows "%i turns left" as "%s"', (turns, label) => {
    renderAs('player-b', reviveState(turns));
    expect(screen.getByRole('region').textContent).toContain(label);
  });

  it('sends the revive command with no payload', async () => {
    const reviveTeammate = vi.fn(() => Promise.resolve(success));
    renderAs('player-b', reviveState(), { reviveTeammate });

    fireEvent.click(screen.getByRole('button', { name: 'Hồi sinh Dũng — 750.000 ₫' }));

    await waitFor(() => expect(reviveTeammate).toHaveBeenCalledTimes(1));
    expect(reviveTeammate).toHaveBeenCalledWith();
    expect(screen.getByRole('status').textContent).toBe('Đang gửi yêu cầu…');
  });

  it('explains why the button is off when the survivor cannot pay', () => {
    const state = reviveState();
    state.players['player-b'].accountBalance = 749;
    renderAs('player-b', state);

    expect(screen.getByRole('button', { name: 'Hồi sinh Dũng — 750.000 ₫' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('region').textContent).toContain('Bạn cần 750.000 ₫ để hồi sinh Dũng.');
  });

  it('explains that a window opened this very turn starts with the next one', () => {
    const state = reviveState();
    state.boardState.turnNumber = 1;
    renderAs('player-b', state);

    expect(screen.getByRole('button', { name: 'Hồi sinh Dũng — 750.000 ₫' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('region').textContent).toContain('Cơ hội hồi sinh bắt đầu từ lượt kế tiếp của bạn.');
  });

  it('shows a refused revive and lets the survivor try again', async () => {
    const reviveTeammate = vi.fn(() => Promise.resolve({
      ok: false,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      error: { code: 'CONFLICT', message: 'Không thể hồi sinh đồng đội vào lúc này.', retryable: false },
    } satisfies Ack));
    renderAs('player-b', reviveState(), { reviveTeammate });

    fireEvent.click(screen.getByRole('button', { name: 'Hồi sinh Dũng — 750.000 ₫' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Không thể hồi sinh đồng đội vào lúc này.'));
    expect(screen.getByRole('button', { name: 'Hồi sinh Dũng — 750.000 ₫' }).hasAttribute('disabled')).toBe(false);
  });

  it('is not shown to the other players, off the survivor\'s turn, to a read-only viewer or in Solo', () => {
    const state = reviveState();
    const { unmount } = renderAs('player-a', state);
    expect(screen.queryByRole('region')).toBeNull();
    unmount();

    const notTheirTurn = reviveState();
    notTheirTurn.boardState.currentPlayer = { id: 'player-a', hasMoved: false };
    const second = renderAs('player-b', notTheirTurn);
    expect(screen.queryByRole('region')).toBeNull();
    second.unmount();

    const readOnly = renderAs('player-b', reviveState(), {}, false);
    expect(screen.queryByRole('region')).toBeNull();
    readOnly.unmount();

    renderAs('player-a', makeRoom().gameState);
    expect(screen.queryByRole('region')).toBeNull();
  });
});
