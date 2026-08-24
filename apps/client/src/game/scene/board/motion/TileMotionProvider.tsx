import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useEffectiveReducedMotion } from '../../../../settings/selectors';
import { TileMotionController } from './TileMotionController';
import type { TileImpactSignal } from './tileMotionTypes';

const tileMotionContext = createContext<TileMotionController | null>(null);

interface TileMotionProviderProps {
  impacts: readonly TileImpactSignal[];
  resetEpoch: number;
  children: ReactNode;
}

export function getUnprocessedTileImpacts(
  impacts: readonly TileImpactSignal[],
  lastSequence: number,
): TileImpactSignal[] {
  return impacts
    .filter(impact => impact.sequence > lastSequence)
    .slice()
    .sort((left, right) => left.sequence - right.sequence);
}

export default function TileMotionProvider({ impacts, resetEpoch, children }: TileMotionProviderProps) {
  const invalidate = useThree(state => state.invalidate);
  const reducedMotion = useEffectiveReducedMotion();
  const controllerRef = useRef<TileMotionController | null>(null);
  if (!controllerRef.current) controllerRef.current = new TileMotionController();
  const controller = controllerRef.current;
  const initializedRef = useRef(false);
  const lastSequenceRef = useRef(0);

  useEffect(() => {
    controller.setInvalidate(invalidate);
    controller.setReducedMotion(reducedMotion);
    return () => controller.reset();
  }, [controller, invalidate, reducedMotion]);

  useEffect(() => {
    controller.reset();
    lastSequenceRef.current = 0;
  }, [controller, resetEpoch]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSequenceRef.current = impacts.reduce((latest, impact) => Math.max(latest, impact.sequence), 0);
      return;
    }
    getUnprocessedTileImpacts(impacts, lastSequenceRef.current)
      .forEach(impact => controller.press(impact.tileId, impact.kind, impact));
    lastSequenceRef.current = impacts.reduce((latest, impact) => Math.max(latest, impact.sequence), lastSequenceRef.current);
  }, [controller, impacts]);

  return <tileMotionContext.Provider value={controller}>{children}</tileMotionContext.Provider>;
}

export function useTileMotionController(): TileMotionController | null {
  return useContext(tileMotionContext);
}
