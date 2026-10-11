import {
  act, cleanup, render, waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { presentationStoreContext } from '../../presentation/PresentationProvider';
import type { AnimationQueue } from '../../presentation/queue/AnimationQueue';
import { PresentationStore } from '../../presentation/store/presentationStore';
import { cloneRoom, makeRoom } from '../../presentation/testFixtures';
import { SettingsProvider } from '../../../settings/SettingsProvider';
import { DEFAULT_GAME_SETTINGS } from '../../../settings/defaults';
import DiceResultCallout, { DICE_CALLOUT_LIFETIME_MS } from './DiceResultCallout';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(ui: ReactNode, store: PresentationStore, localPlayerId = 'player-a', reducedMotion = false) {
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
    <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion }}>
      <presentationStoreContext.Provider value={{ store, queue: null as unknown as AnimationQueue }}>
        <stateContext.Provider value={value}>{ui}</stateContext.Provider>
      </presentationStoreContext.Provider>
    </SettingsProvider>,
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

  it('uses fade-only presentation when Reduced Motion is enabled', () => {
    const store = new PresentationStore();
    const { container } = mount(<DiceResultCallout />, store, 'player-a', true);
    act(() => { store.settleDiceRoll({ dice1: 2, dice2: 4 }, 1); });
    expect(container.querySelector('.dice-callout')).not.toBeNull();
    expect((container.querySelector('.dice-callout') as HTMLElement).style.transform).toBe('');
  });

  it('exits after its lifetime, scaled by the animation speed', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const store = new PresentationStore();
    act(() => { store.setAnimationSpeedMultiplier(2); });
    const { container } = mount(<DiceResultCallout />, store);
    act(() => { store.settleDiceRoll({ dice1: 1, dice2: 2 }, 1); });
    expect(container.querySelector('.dice-callout')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(DICE_CALLOUT_LIFETIME_MS / 2); });
    expect(container.querySelector('.dice-callout')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(DICE_CALLOUT_LIFETIME_MS / 2); });
    const exitingCallout = container.querySelector('.dice-callout');
    expect(exitingCallout).not.toBeNull();
    vi.useRealTimers();
    return waitFor(() => expect(exitingCallout?.isConnected).toBe(false));
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

  it('clears a visible callout immediately when the reset epoch changes', async () => {
    const store = new PresentationStore();
    const { container, room } = mount(<DiceResultCallout />, store);
    act(() => { store.settleDiceRoll({ dice1: 2, dice2: 5 }, 1); });
    expect(container.querySelector('.dice-callout')).not.toBeNull();
    act(() => { store.resetFromSnapshot(cloneRoom(room)); });
    await waitFor(() => expect(container.querySelector('.dice-callout')).toBeNull());
  });
});
