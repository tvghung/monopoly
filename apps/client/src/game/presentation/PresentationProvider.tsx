import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useEffectiveReducedMotion, useSettings } from '../../settings/selectors';
import type { PresentationController } from './PresentationController';
import type { AnimationQueue } from './queue/AnimationQueue';
import type { PresentationState, PresentationStoreLike } from './store/types';

interface PresentationContextValue {
  state: PresentationState;
  queue: AnimationQueue;
}

export const emptyPresentationState: PresentationState = {
  displayLogs: [],
  displayActivity: [],
  displayPositions: {},
  settledPositions: {},
  displayBalances: {},
  displayDevelopmentLevels: {},
  displayActivePlayerId: null,
  displayDice: { dice1: 0, dice2: 0 },
  displayRollSequence: 0,
  diceRoll: null,
  status: 'idle',
  tileImpacts: [],
  characterMovements: [],
  characterLandings: [],
  characterReactions: [],
  balanceDeltas: [],
  ownershipChanges: [],
  developmentChanges: [],
  goCrossings: [],
  destinationPreview: null,
  moneyTransfers: [],
  cardPresentation: null,
  animationSpeedMultiplier: 1,
  reducedMotion: false,
  presentationResetEpoch: 0,
};

/**
 * An explicit, static presentation state. Nothing provides it in the app: tests use it to inject a state for
 * `usePresentation()` / `usePresentationSelector()` without a live controller, and it wins over the live store.
 * Because the app never provides it, reading it costs no re-renders.
 */
export const presentationContext = createContext<PresentationContextValue | null>(null);

/**
 * The live store and queue. Its value only changes when the controller does, so a component that reads one slice
 * (`usePresentationSelector`) is not re-rendered by every presentation tick.
 */
export interface PresentationStoreContextValue {
  store: Pick<PresentationStoreLike, 'getSnapshot' | 'subscribe'>;
  queue: AnimationQueue;
}
export const presentationStoreContext = createContext<PresentationStoreContextValue | null>(null);

export function PresentationProvider({ controller, children }: { controller: PresentationController; children: ReactNode }) {
  const { settings } = useSettings();
  const reducedMotion = useEffectiveReducedMotion();

  useEffect(() => {
    controller.setPreferences(reducedMotion, settings.animationSpeed);
  }, [controller, reducedMotion, settings.animationSpeed]);
  useEffect(() => {
    controller.retain();
    return () => controller.release();
  }, [controller]);

  const storeValue = useMemo<PresentationStoreContextValue>(
    () => ({ store: controller.store, queue: controller.queue }),
    [controller],
  );

  return <presentationStoreContext.Provider value={storeValue}>{children}</presentationStoreContext.Provider>;
}

const noopSubscribe = (): (() => void) => () => undefined;

interface PresentationSource {
  subscribe: (listener: () => void) => () => void;
  getState: () => PresentationState;
  queue: AnimationQueue;
}

/** Injected state first (tests), then the live store, then an empty state so an unmounted provider is safe. */
function usePresentationSource(): PresentationSource {
  const injected = useContext(presentationContext);
  const live = useContext(presentationStoreContext);
  return useMemo<PresentationSource>(() => {
    if (injected) {
      return { subscribe: noopSubscribe, getState: () => injected.state, queue: injected.queue };
    }
    if (live) {
      return {
        subscribe: live.store.subscribe.bind(live.store),
        getState: () => live.store.getSnapshot(),
        queue: live.queue,
      };
    }
    return { subscribe: noopSubscribe, getState: () => emptyPresentationState, queue: null as unknown as AnimationQueue };
  }, [injected, live]);
}

/**
 * Memoizes a selection per presentation state and keeps the previous selection when the new one is equal, so a
 * consumer only sees a new value when its slice really changed. Lives outside the hook because it mutates its cache.
 */
function createSelectionCache<T>(
  selector: (state: PresentationState) => T,
  isEqual: (previous: T, next: T) => boolean,
): (state: PresentationState) => T {
  let hasValue = false;
  let lastState: PresentationState | undefined;
  let lastSelection: T;
  return state => {
    if (hasValue && lastState === state) return lastSelection;
    const next = selector(state);
    lastState = state;
    if (hasValue && isEqual(lastSelection, next)) return lastSelection;
    hasValue = true;
    lastSelection = next;
    return next;
  };
}

/** Selects one slice of the presentation state; see `usePresentationSelector`. */
export function usePresentationSlice<T>(
  selector: (state: PresentationState) => T,
  isEqual: (previous: T, next: T) => boolean,
): T {
  const source = usePresentationSource();
  const getSelection = useMemo(() => createSelectionCache(selector, isEqual), [isEqual, selector]);
  const getSnapshot = (): T => getSelection(source.getState());
  return useSyncExternalStore(source.subscribe, getSnapshot, () => getSelection(emptyPresentationState));
}

/** The whole presentation state: every consumer re-renders on every store change. Prefer `usePresentationSelector`. */
export function usePresentation(): PresentationContextValue {
  const source = usePresentationSource();
  const state = useSyncExternalStore(source.subscribe, source.getState, () => emptyPresentationState);
  return useMemo(() => ({ state, queue: source.queue }), [source.queue, state]);
}
