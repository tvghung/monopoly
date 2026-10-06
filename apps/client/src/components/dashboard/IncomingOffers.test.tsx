import {
  cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';
import type { PrivateOffer, PublicGameState } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import IncomingOffers from './IncomingOffers';
import { soloTeamBoardFields } from '../../game/presentation/testFixtures';

afterEach(cleanup);

const state: PublicGameState = {
  boardState: {
    ...soloTeamBoardFields(),
    gameStarted: true,
    players: ['proposer', 'recipient'],
    finishedPlayers: {},
    turnNumber: 2,
    currentPlayer: { id: '', hasMoved: false },
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 2, dice2: 3 },
    rollSequence: 1,
    gameplayEvents: { sequence: 0, events: [] },
    activityFeed: { sequence: 0, events: [] },
    ownedProps: {
      1: { id: 'proposer', color: 'red', houses: 0 },
      37: { id: 'recipient', color: 'blue', houses: 0 },
    },
    winner: null,
  },
  players: {
    proposer: {
      teamId: 'TEAM_1',
      name: 'An',
      currentTile: 0,
      color: 'red',
      characterId: 'dog',
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      getOutOfJailCardCount: 0,
    },
    recipient: {
      teamId: 'TEAM_2',
      name: 'Bình',
      currentTile: 0,
      color: 'blue',
      characterId: 'panda',
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      getOutOfJailCardCount: 0,
    },
  },
  turnInfo: {},
  deckCounts: { chance: 16, chest: 16 },
  loaded: true,
};

function makeOffer(overrides: Partial<PrivateOffer> = {}): PrivateOffer {
  return {
    offerId: 'offer-1',
    roomId: 'room-1',
    proposerPlayerId: 'proposer',
    recipientPlayerId: 'recipient',
    proposerName: 'An',
    recipientName: 'Bình',
    offered: { cash: 100, propertyIds: [1], jailFreeCardIds: [] },
    requested: { cash: 25, propertyIds: [37], jailFreeCardIds: [] },
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}

function renderOffers(offers: PrivateOffer[], socketFunctions: Partial<SocketFunctions> = {}) {
  const contextValue: StateContextValue = {
    state,
    socketFunctions: {
      acceptOffer: vi.fn(),
      declineOffer: vi.fn(),
      ...socketFunctions,
    } as unknown as SocketFunctions,
    playerId: 'recipient',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: offers,
  };
  return render(
    <stateContext.Provider value={contextValue}>
      <IncomingOffers />
    </stateContext.Provider>,
  );
}

describe('IncomingOffers', () => {
  it('stays closed while the recipient is in debt: the debt dialog answers the offer', () => {
    const inDebt: PublicGameState = {
      ...state,
      boardState: {
        ...state.boardState,
        paymentShortfall: {
          rescue: null,
          debtorPlayerId: 'recipient',
          creditor: 'BANK',
          amount: 300,
          remainingAmount: 300,
          source: { kind: 'OTHER', description: 'test' },
          actionDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
          remainingClaimCount: 1,
        },
      },
    };
    render(
      <stateContext.Provider value={{
        state: inDebt,
        socketFunctions: { acceptOffer: vi.fn(), declineOffer: vi.fn() } as unknown as SocketFunctions,
        playerId: 'recipient',
        role: 'PLAYER',
        connected: true,
        canMutate: true,
        privatePlayerState: null,
        privateOffers: [makeOffer()],
      }}
      >
        <IncomingOffers />
      </stateContext.Provider>,
    );

    expect(screen.queryByRole('dialog', { name: 'Đề nghị giao dịch' })).toBeNull();
  });

  it('shows each side of the offer as deed chips and cash, with the sender avatar', () => {
    renderOffers([makeOffer()]);

    const theirs = screen.getByRole('group', { name: 'An giao' });
    expect(within(theirs).getByText('Cà Mau')).toBeTruthy();
    expect(within(theirs).getByText('100.000 ₫')).toBeTruthy();
    const yours = screen.getByRole('group', { name: 'Bạn giao' });
    expect(within(yours).getByText('Đồng Khởi')).toBeTruthy();
    expect(within(yours).getByText('25.000 ₫')).toBeTruthy();

    const dialog = screen.getByRole('dialog', { name: 'Đề nghị giao dịch' });
    expect(within(dialog).getByRole('heading', { name: 'Đề nghị từ An' })).toBeTruthy();
    expect(dialog.querySelector('.trade-offers-modal__sender img')).not.toBeNull();
    expect(within(dialog).getByText('Hết hạn sau: 60 giây')).toBeTruthy();
  });

  it('names Get Out Of Jail Free cards and an empty side', () => {
    renderOffers([makeOffer({
      offered: { cash: 0, propertyIds: [], jailFreeCardIds: ['chance-jail-free'] },
      requested: { cash: 0, propertyIds: [], jailFreeCardIds: [] },
    })]);

    expect(within(screen.getByRole('group', { name: 'An giao' })).getByText('1 thẻ Thoát Tù Miễn Phí')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Bạn giao' })).getByText('Không có tài sản')).toBeTruthy();
  });

  it('accepts or declines the offer by id and has no close button', () => {
    const acceptOffer = vi.fn();
    const declineOffer = vi.fn();
    renderOffers([makeOffer()], { acceptOffer, declineOffer });

    expect(screen.queryByRole('button', { name: 'Đóng' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận' }));
    expect(acceptOffer).toHaveBeenCalledWith('offer-1');
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(declineOffer).toHaveBeenCalledWith('offer-1');
  });

  it('disables both answers and says why once the offer has expired', () => {
    renderOffers([makeOffer({ expiresAt: new Date(Date.now() - 1000).toISOString() })]);

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Chấp nhận' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Từ chối' }).disabled).toBe(true);
    expect(screen.getByText('Đề nghị đã hết hạn.')).toBeTruthy();
  });

  it('stacks several offers in one dialog and focuses the first answer', () => {
    renderOffers([makeOffer(), makeOffer({ offerId: 'offer-2' })]);

    expect(screen.getAllByRole('button', { name: 'Chấp nhận' })).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getAllByRole('button', { name: 'Chấp nhận' })[0]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('tells the answers of several offers apart by the sender in their description', () => {
    renderOffers([makeOffer(), makeOffer({ offerId: 'offer-2', proposerPlayerId: 'player-c', proposerName: 'Chi' })]);

    const describe = (button: HTMLElement) => document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent;
    const accepts = screen.getAllByRole('button', { name: 'Chấp nhận' });
    const declines = screen.getAllByRole('button', { name: 'Từ chối' });
    expect(describe(accepts[0])).toBe(describe(declines[0]));
    expect(describe(accepts[1])).toBe(describe(declines[1]));
    expect(describe(accepts[0])).not.toBe(describe(accepts[1]));
    expect(describe(accepts[1])).toBe('Đề nghị từ Chi');
    expect(screen.getAllByRole('region', { name: /Đề nghị từ/ })).toHaveLength(2);
  });
});
