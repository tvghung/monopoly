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
import StatusPill, { turnText } from './StatusPill';

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

describe('turnText', () => {
  it('keeps the strings the roll control used before the status pill', () => {
    expect(turnText('player-a', 'player-a', 'An')).toBe('Lượt của bạn');
    expect(turnText('player-b', 'player-a', 'Bình')).toBe('Bình đang chơi');
    expect(turnText('player-b', 'player-a', undefined)).toBe('Đang chờ lượt chơi');
    expect(turnText('player-a', null, 'An')).toBe('An đang chơi');
  });
});

describe('StatusPill', () => {
  it('shows the room code and the turn text in the unchanged turn label element', () => {
    const { container } = renderHud(<StatusPill />, { roomCode: 'UIUX-1' });
    expect(screen.getByText('Phòng UIUX-1')).toBeTruthy();
    const label = container.querySelector('p.game-board__turn-label');
    expect(label?.textContent).toBe('Lượt của bạn');
  });

  it('follows the displayed active player, not the authoritative one', () => {
    renderHud(<StatusPill />, { presentation: { displayActivePlayerId: 'player-b' } });
    expect(screen.getByText('Bình đang chơi')).toBeTruthy();
    expect(screen.queryByText('Lượt của bạn')).toBeNull();
  });

  it('reads the turn as somebody else’s for a spectator', () => {
    renderHud(<StatusPill />, { localPlayerId: null });
    expect(screen.getByText('An đang chơi')).toBeTruthy();
  });

  it('hides the mascot from assistive technology; the text carries the turn', () => {
    const { container } = renderHud(<StatusPill />);
    expect(container.querySelector('.status-pill__avatar')?.getAttribute('aria-hidden')).toBe('true');
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
