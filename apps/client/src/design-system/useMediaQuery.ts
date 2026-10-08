import { useSyncExternalStore } from 'react';

interface QuerySource {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
}

const sources = new Map<string, QuerySource>();

/** One stable subscribe / snapshot pair per query, so useSyncExternalStore does not resubscribe on every render. */
function sourceFor(query: string): QuerySource {
  const cached = sources.get(query);
  if (cached) return cached;
  const source: QuerySource = {
    subscribe: onChange => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    getSnapshot: () => typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia(query).matches,
  };
  sources.set(query, source);
  return source;
}

/**
 * Whether a CSS media query currently matches. Used where a component must pick a different variant (for example a compact
 * deed card on a phone held sideways), not for styling, which stays in CSS. False where `matchMedia` does not exist.
 */
export function useMediaQuery(query: string): boolean {
  const { subscribe, getSnapshot } = sourceFor(query);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * A window up to 720 px wide: the width at which `hud.css` stops placing the HUD's context stack beside the corner cards. It is the
 * same breakpoint as the CSS, because `CenterStage` and `BottomDock` pick where the jail panel lives from it.
 */
export const NARROW_HUD_QUERY = '(max-width: 720px)';

/** A phone held sideways, or any window too short for the full deed card beside the decision. */
export const SHORT_VIEWPORT_QUERY = '(orientation: landscape) and (max-height: 31rem)';
