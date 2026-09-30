import {
  act, cleanup, render, renderHook, screen,
} from '@testing-library/react';
import { StrictMode, useRef, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PresentationController } from './PresentationController';
import { presentationContext, PresentationProvider } from './PresentationProvider';
import { usePresentationSelector } from './usePresentationSelector';
import { cloneRoom, makeRoom } from './testFixtures';
import type { PresentationState } from './store/types';

afterEach(cleanup);

const selectBalance = (state: PresentationState) => state.displayBalances['player-a'] ?? -1;
const selectEpoch = (state: PresentationState) => state.presentationResetEpoch;

function BalanceProbe() {
  const renders = useRef(0);
  renders.current += 1;
  const balance = usePresentationSelector(selectBalance);
  return <output data-testid="balance" data-renders={renders.current}>{balance}</output>;
}

function EpochProbe() {
  const epoch = usePresentationSelector(selectEpoch);
  return <output data-testid="epoch">{epoch}</output>;
}

describe('usePresentationSelector', () => {
  it('re-renders only when the selected slice changes', () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    render(
      <StrictMode>
        <PresentationProvider controller={controller}>
          <BalanceProbe />
        </PresentationProvider>
      </StrictMode>,
    );
    act(() => { controller.acceptRoomSnapshot(initial, 'SESSION_SYNC'); });
    expect(screen.getByTestId('balance').textContent).toBe('1500');
    const rendersAfterSync = Number(screen.getByTestId('balance').getAttribute('data-renders'));

    // Unrelated presentation changes must not re-render this consumer.
    act(() => { controller.store.setAnimationSpeedMultiplier(2); });
    act(() => { controller.store.setReducedMotion(true); });
    expect(screen.getByTestId('balance').textContent).toBe('1500');
    expect(Number(screen.getByTestId('balance').getAttribute('data-renders'))).toBe(rendersAfterSync);

    act(() => { controller.store.syncDisplayBalances({ 'player-a': 1234 }); });
    expect(screen.getByTestId('balance').textContent).toBe('1234');
    expect(Number(screen.getByTestId('balance').getAttribute('data-renders'))).toBeGreaterThan(rendersAfterSync);
  });

  it('propagates a presentation reset epoch change', () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    render(
      <PresentationProvider controller={controller}>
        <EpochProbe />
      </PresentationProvider>,
    );
    act(() => { controller.acceptRoomSnapshot(initial, 'SESSION_SYNC'); });
    const before = Number(screen.getByTestId('epoch').textContent);
    act(() => { controller.acceptRoomSnapshot(cloneRoom(initial), 'SESSION_SYNC'); });
    expect(Number(screen.getByTestId('epoch').textContent)).toBeGreaterThan(before);
  });

  it('selects from an injected presentation state when there is no live store', () => {
    const state = { displayBalances: { 'player-a': 777 } } as unknown as PresentationState;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <presentationContext.Provider value={{ state, queue: null as never }}>{children}</presentationContext.Provider>
    );
    const { result } = renderHook(() => usePresentationSelector(selectBalance), { wrapper });
    expect(result.current).toBe(777);
  });

  it('selects from an empty presentation state when nothing provides one', () => {
    const { result } = renderHook(() => usePresentationSelector(selectBalance));
    expect(result.current).toBe(-1);
  });
});
