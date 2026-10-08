import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { presentationContext, emptyPresentationState } from '../../presentation/PresentationProvider';
import type { AnimationQueue } from '../../presentation/queue/AnimationQueue';
import type { PresentationState } from '../../presentation/store/types';
import { makeRoom } from '../../presentation/testFixtures';
import CenterStage from './CenterStage';
import StatusPill from './StatusPill';

afterEach(cleanup);

const socketFunctions = { rollDice: vi.fn() } as unknown as SocketFunctions;

function renderHud(
  ui: ReactNode,
  options: {
    localPlayerId?: string | null;
    presentation?: Partial<PresentationState>;
    mutate?: (room: ReturnType<typeof makeRoom>) => void;
    roomCode?: string;
  } = {},
) {
  const room = makeRoom();
  options.mutate?.(room);
  const localPlayerId = options.localPlayerId === undefined ? 'player-a' : options.localPlayerId;
  const value: StateContextValue = {
    state: room.gameState,
    socketFunctions,
    playerId: localPlayerId,
    role: localPlayerId ? 'PLAYER' : 'SPECTATOR',
    connected: true,
    canMutate: localPlayerId !== null,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
    roomCode: options.roomCode,
  };
  const presentation: PresentationState = {
    ...emptyPresentationState,
    status: 'idle',
    ...options.presentation,
  };
  return render(
    <presentationContext.Provider value={{ state: presentation, queue: null as unknown as AnimationQueue }}>
      <stateContext.Provider value={value}>{ui}</stateContext.Provider>
    </presentationContext.Provider>,
  );
}

describe('StatusPill', () => {
  it('shows only the room code: whose turn it is lives in the center stage', () => {
    const { container } = renderHud(<StatusPill />, { roomCode: 'UIUX-1' });
    expect(screen.getByText('Phòng UIUX-1')).toBeTruthy();
    expect(container.querySelector('.game-board__turn-label')).toBeNull();
    expect(screen.queryByText('Lượt của bạn')).toBeNull();
    expect(container.querySelector('.status-pill__avatar')).toBeNull();
  });

  it('renders nothing without a room code', () => {
    const { container } = renderHud(<StatusPill />, { presentation: { displayActivePlayerId: 'player-b' } });
    expect(container.querySelector('.status-pill')).toBeNull();
    expect(screen.queryByText(/đang chơi/u)).toBeNull();
  });
});

describe('CenterStage', () => {
  it('waits with the Đổ xúc xắc call to action on your turn and shows no opponent pill', () => {
    renderHud(<CenterStage />);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Đổ xúc xắc' });
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Space');
    expect(screen.queryByText(/đang đi…/)).toBeNull();
  });

  it('names the player on the move on somebody else’s turn and offers no button', () => {
    renderHud(<CenterStage />, {
      mutate: room => { room.gameState.boardState.currentPlayer = { id: 'player-b', hasMoved: false }; },
    });
    expect(screen.getByText('Bình đang đi…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Đổ xúc xắc' })).toBeNull();
  });

  it('follows the displayed turn for the pill', () => {
    renderHud(<CenterStage />, { presentation: { displayActivePlayerId: 'player-b' } });
    expect(screen.getByText('Bình đang đi…')).toBeTruthy();
  });

  it('keeps the opponent pill for a player who just finished while their turn is still displayed', () => {
    renderHud(<CenterStage />, {
      presentation: { displayActivePlayerId: 'player-b' },
      mutate: room => {
        delete room.gameState.players['player-b'];
        room.gameState.boardState.finishedPlayers['player-b'] = {
          teamId: 'TEAM_2',
          name: 'Bình', color: 'blue', characterId: 'panda', reason: 'LEFT', accountBalance: 100,
        };
      },
    });
    expect(screen.getByText('Bình đang đi…')).toBeTruthy();
  });

  it('steps aside while the dice are rolling', () => {
    renderHud(<CenterStage />, {
      presentation: { diceRoll: { lifecycle: 'rolling', dice: { dice1: 2, dice2: 3 }, rollSequence: 1, durationMs: 900 } },
    });
    expect(screen.queryByRole('button', { name: 'Đổ xúc xắc' })).toBeNull();
  });

  it('hides the opponent pill while a card is on screen and after the game is won', () => {
    const { unmount } = renderHud(<CenterStage />, {
      presentation: { displayActivePlayerId: 'player-b', cardPresentation: { stage: 'REVEALED' } as unknown as PresentationState['cardPresentation'] },
    });
    expect(screen.queryByText('Bình đang đi…')).toBeNull();
    unmount();
    renderHud(<CenterStage />, {
      presentation: { displayActivePlayerId: 'player-b' },
      mutate: room => { room.gameState.boardState.winner = {
          playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', reason: 'WINNER', accountBalance: 4000,
        } as never; },
    });
    expect(screen.queryByText('Bình đang đi…')).toBeNull();
  });

  it('keeps the live dice announcement mounted even when there is nothing to show', () => {
    const { container } = renderHud(<CenterStage />, {
      mutate: room => { room.gameState.boardState.currentPlayer = { id: 'player-b', hasMoved: false }; },
    });
    expect(container.querySelector('[data-testid="roll-control"] [role="status"]')).toBeTruthy();
  });
});

describe('CenterStage jail group', () => {
  const jail = (room: ReturnType<typeof makeRoom>) => {
    room.gameState.players['player-a'].isJail = true;
    room.gameState.players['player-a'].getOutOfJailCardCount = 1;
  };

  it('puts the roll call to action and the ways out of jail in the one stage column at every window size', () => {
    const { container } = renderHud(<CenterStage />, { mutate: jail });

    const stage = container.querySelector('.center-stage');
    const roll = screen.getByRole<HTMLButtonElement>('button', { name: 'Đổ xúc xắc' });
    const panel = screen.getByRole('region', { name: 'Bạn đang ở Nhà Tù' });
    expect(stage?.contains(roll)).toBe(true);
    expect(stage?.contains(panel)).toBe(true);
    // The roll comes first in the column and in the tab order; the bail and the card follow it.
    expect(roll.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Đổ xúc xắc/u })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Trả/u })).toBeTruthy();
    // The phone tier draws "Dùng thẻ (1)"; the button's name stays the full one.
    expect(screen.getByRole('button', { name: 'Dùng thẻ Thoát Tù Miễn Phí (1)' })).toBeTruthy();
  });

  it('shows the jail panel for a jailed player only', () => {
    renderHud(<CenterStage />);
    expect(screen.queryByRole('region', { name: 'Bạn đang ở Nhà Tù' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đổ xúc xắc' })).toBeTruthy();
  });

  it('marks the stage busy while the dice roll, and keeps the panel mounted so a pending request is not lost', () => {
    const { container } = renderHud(<CenterStage />, {
      mutate: jail,
      presentation: { diceRoll: { lifecycle: 'rolling', dice: { dice1: 2, dice2: 3 }, rollSequence: 1, durationMs: 900 } },
    });

    expect(container.querySelector('.center-stage')?.getAttribute('data-stage-busy')).toBe('true');
    expect(container.querySelector('.jail-panel')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Đổ xúc xắc' })).toBeNull();
  });
});
