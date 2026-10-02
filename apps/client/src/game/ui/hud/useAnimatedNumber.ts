import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';

/** The counter takes this long at speed 1 (divided by the animation speed). */
export const COUNTER_DURATION_MS = 480;

/** The part of framer-motion's `animate` this hook needs; tests inject a fake instead of mocking the module. */
export type NumberAnimator = (
  from: number,
  to: number,
  options: { duration: number; ease: 'easeOut'; onUpdate: (latest: number) => void; onComplete: () => void },
) => { stop: () => void };

export interface AnimatedNumberOptions {
  reducedMotion: boolean;
  speed: number;
  /** A changed epoch means "snap": the value jumps and any running animation stops. */
  resetEpoch: number;
}

/**
 * A whole number that counts from its previous displayed value to `target`. A new target while a count is running
 * continues from the value currently shown, so the number never jumps backwards. Reduced motion and a changed
 * presentation reset epoch (session sync, reconnect, replay) set the value at once.
 */
export function useAnimatedNumber(
  target: number,
  { reducedMotion, speed, resetEpoch }: AnimatedNumberOptions,
  animator: NumberAnimator = animate,
): number {
  const [value, setValue] = useState(target);
  const shownRef = useRef(target);
  const epochRef = useRef(resetEpoch);

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    const show = (next: number) => {
      shownRef.current = next;
      setValue(next);
    };

    if (epochRef.current !== resetEpoch) {
      epochRef.current = resetEpoch;
      show(target);
    } else if (target !== shownRef.current) {
      if (reducedMotion) {
        show(target);
      } else {
        controls = animator(shownRef.current, target, {
          duration: COUNTER_DURATION_MS / 1000 / Math.max(0.1, speed),
          ease: 'easeOut',
          onUpdate: latest => show(Math.round(latest)),
          onComplete: () => show(target),
        });
      }
    }
    return () => controls?.stop();
  }, [animator, reducedMotion, resetEpoch, speed, target]);

  return value;
}
