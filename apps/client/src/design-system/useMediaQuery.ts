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

/**
 * A window the game does not play in: portrait on a narrow window (up to 48rem) or portrait on a touch device up to 1100 px wide
 * (phones and tablets; gameplay there is landscape only). The same text is the media query of the rotate-device notice in
 * `BoardShell.css`; a desktop window with a mouse is never blocked by its shape above 48rem.
 */
export const PORTRAIT_BLOCKED_QUERY = '(orientation: portrait) and (max-width: 48rem), (orientation: portrait) and (pointer: coarse) and (max-width: 1100px)';

/**
 * A phone-sized window (up to 720 px wide or up to 500 px tall): the HUD keeps to what a player has to act on there. Routine events
 * (another player's turn banner, their balance changes) are left to the status pill, the cards and the Journal. Same breakpoints as `hud.css`.
 */
export const COMPACT_HUD_QUERY = '(max-width: 720px), (max-height: 500px)';

/** A phone held sideways, or any window too short for the full deed card beside the decision. */
export const SHORT_VIEWPORT_QUERY = '(orientation: landscape) and (max-height: 31rem)';
