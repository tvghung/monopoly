import {
  act, cleanup, render,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { presentationStoreContext } from '../../presentation/PresentationProvider';
import type { AnimationQueue } from '../../presentation/queue/AnimationQueue';
import { PresentationStore } from '../../presentation/store/presentationStore';
import { cloneRoom, makeRoom } from '../../presentation/testFixtures';
import DiceResultCallout, { DICE_CALLOUT_LIFETIME_MS } from './DiceResultCallout';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(ui: ReactNode, store: PresentationStore, localPlayerId = 'player-a') {
  const room = makeRoom();
  store.resetFromSnapshot(room);
  const value: StateContextValue = {
    state: room.gameState,
    socketFunctions: {} as SocketFunctions,
    playerId: localPlayerId,
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
  };
  const view = render(
    <presentationStoreContext.Provider value={{ store, queue: null as unknown as AnimationQueue }}>
      <stateContext.Provider value={value}>{ui}</stateContext.Provider>
    </presentationStoreContext.Provider>,
  );
  return { ...view, room };
}

describe('DiceResultCallout', () => {
  it('appears once a live roll settles, with the two dice, their total and no doubles chip', () => {
    const store = new PresentationStore();
    const { container } = mount(<DiceResultCallout />, store);
    expect(container.querySelector('.dice-callout')).toBeNull();

    act(() => { store.startDiceRoll({ dice1: 4, dice2: 3 }, 1, 900); });
    expect(container.querySelector('.dice-callout')).toBeNull();

    act(() => { store.settleDiceRoll({ dice1: 4, dice2: 3 }, 1); });
    const callout = container.querySelector('.dice-callout');
    expect(callout).not.toBeNull();
    expect(callout!.querySelector('.dice-callout__total')!.textContent).toBe('7');
    expect(callout!.querySelectorAll('.dice-callout__die')).toHaveLength(2);
    expect(callout!.textContent).not.toContain('Đổ đôi');
    expect(callout!.getAttribute('aria-hidden')).toBe('true');
  });

  it('adds an informational Đổ đôi chip for doubles', () => {
    const store = new PresentationStore();
    const { container } = mount(<DiceResultCallout />, store);
    act(() => { store.startDiceRoll({ dice1: 3, dice2: 3 }, 1, 900); });
    act(() => { store.settleDiceRoll({ dice1: 3, dice2: 3 }, 1); });
    expect(container.querySelector('.dice-callout')!.textContent).toContain('Đổ đôi');
    expect(container.querySelector('.dice-callout__total')!.textContent).toBe('6');
  });

  it('leaves after its lifetime, scaled by the animation speed', () => {
    const store = new PresentationStore();
    act(() => { store.setAnimationSpeedMultiplier(2); });
    const { container } = mount(<DiceResultCallout />, store);
    act(() => { store.settleDiceRoll({ dice1: 1, dice2: 2 }, 1); });
    expect(container.querySelector('.dice-callout')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(DICE_CALLOUT_LIFETIME_MS / 2 - 20); });
    expect(container.querySelector('.dice-callout')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(40); });
    expect(container.querySelector('.dice-callout')).toBeNull();
  });

  it('does not appear after a snap or reset that hands over a finished roll', () => {
    const store = new PresentationStore();
    const { container, room } = mount(<DiceResultCallout />, store);
    const later = cloneRoom(room);
    later.gameState.boardState.diceValue = { dice1: 5, dice2: 6 };
    later.gameState.boardState.rollSequence = 4;
    act(() => { store.resetFromSnapshot(later); });
    expect(container.querySelector('.dice-callout')).toBeNull();
    expect(store.getSnapshot().displayRollSequence).toBe(4);
  });

  it('clears a visible callout when the reset epoch changes', () => {
    const store = new PresentationStore();
    const { container, room } = mount(<DiceResultCallout />, store);
    act(() => { store.settleDiceRoll({ dice1: 2, dice2: 5 }, 1); });
    expect(container.querySelector('.dice-callout')).not.toBeNull();
    act(() => { store.resetFromSnapshot(cloneRoom(room)); });
    expect(container.querySelector('.dice-callout')).toBeNull();
  });
});
