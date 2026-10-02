import { useEffect } from 'react';
import { useEffectiveReducedMotion } from './selectors';

/**
 * Mirrors the effective reduced-motion preference (in-game setting OR the OS query) onto
 * `<html data-reduced-motion="true|false">` so CSS can react to the setting, not only the OS media query.
 */
export function ReducedMotionDocumentSync() {
  const reducedMotion = useEffectiveReducedMotion();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
    return () => {
      delete root.dataset.reducedMotion;
    };
  }, [reducedMotion]);

  return null;
}
