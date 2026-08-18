import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useEffectiveReducedMotion, useSettings } from '../../settings/selectors';
import type { PresentationController } from './PresentationController';
import type { AnimationQueue } from './queue/AnimationQueue';
import type { PresentationState } from './store/types';

interface PresentationContextValue {
  state: PresentationState;
  queue: AnimationQueue;
}

const emptyPresentationState: PresentationState = {
  displayPositions: {},
  displayActivePlayerId: null,
  displayDice: { dice1: 0, dice2: 0 },
  status: 'idle',
  tileImpacts: [],
  tileImpactEpoch: 0,
};

export const presentationContext = createContext<PresentationContextValue | null>(null);

export function PresentationProvider({ controller, children }: { controller: PresentationController; children: ReactNode }) {
  const state = useSyncExternalStore(
    controller.store.subscribe.bind(controller.store),
    controller.store.getSnapshot.bind(controller.store),
    () => emptyPresentationState,
  );
  const { settings } = useSettings();
  const reducedMotion = useEffectiveReducedMotion();

  useEffect(() => {
    controller.setPreferences(reducedMotion, settings.animationSpeed);
  }, [controller, reducedMotion, settings.animationSpeed]);
  useEffect(() => {
    controller.retain();
    return () => controller.release();
  }, [controller]);

  return <presentationContext.Provider value={{ state, queue: controller.queue }}>{children}</presentationContext.Provider>;
}

export function usePresentation(): PresentationContextValue {
  const value = useContext(presentationContext);
  if (value) return value;
  return {
    state: emptyPresentationState,
    queue: null as unknown as AnimationQueue,
  };
}
