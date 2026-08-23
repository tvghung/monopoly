import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export interface DiceAnimationProgressRef {
  current: {
    progress: number;
  };
}

const SETTLED_PROGRESS_REF: DiceAnimationProgressRef = { current: { progress: 1 } };
const DiceAnimationProgressContext = createContext<DiceAnimationProgressRef>(SETTLED_PROGRESS_REF);

interface DiceAnimationClockProps {
  phase: 'ROLLING' | 'SETTLED';
  rollSequence: number;
  durationMs: number;
  children: ReactNode;
}

export function DiceAnimationClock({
  phase,
  rollSequence,
  durationMs,
  children,
}: DiceAnimationClockProps) {
  const invalidate = useThree(state => state.invalidate);
  const startRef = useRef<number | null>(null);
  const stateRef = useRef<{ key: string; progress: number }>({
    key: '',
    progress: phase === 'ROLLING' ? 0 : 1,
  });
  const key = `${phase}:${rollSequence}:${durationMs}`;
  if (stateRef.current.key !== key) {
    stateRef.current.key = key;
    stateRef.current.progress = phase === 'ROLLING' ? 0 : 1;
    startRef.current = null;
  }

  useEffect(() => {
    startRef.current = phase === 'ROLLING' ? performance.now() : null;
    if (phase === 'ROLLING') invalidate();
  }, [invalidate, phase, key]);

  useFrame(() => {
    if (phase !== 'ROLLING') {
      stateRef.current.progress = 1;
      return;
    }
    if (startRef.current === null) {
      stateRef.current.progress = 0;
      return;
    }
    stateRef.current.progress = durationMs <= 0
      ? 1
      : Math.min(1, Math.max(0, (performance.now() - startRef.current) / durationMs));
    if (stateRef.current.progress < 1) invalidate();
  });

  const progressRef = useRef<DiceAnimationProgressRef['current']>(stateRef.current);
  progressRef.current = stateRef.current;
  return (
    <DiceAnimationProgressContext.Provider value={progressRef}>
      {children}
    </DiceAnimationProgressContext.Provider>
  );
}

export function useDiceAnimationProgressRef(): DiceAnimationProgressRef {
  return useContext(DiceAnimationProgressContext);
}
