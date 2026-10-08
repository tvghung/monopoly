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

/*
 * Layout tiers of the game screen (game-board.instruction.md "Responsive layout tiers"). The CSS uses the same media texts:
 * - phone: up to 500 px tall or up to 720 px wide (`COMPACT_HUD_QUERY`), a phone held sideways, including Safari with its tab bar
 *   (about 280 px tall);
 * - tablet: up to 1279 px wide or up to 719 px tall, landscape or portrait;
 * - desktop: everything larger.
 * Portrait is played from 600 px wide (tablets); a phone held upright sees the rotate notice (`PORTRAIT_BLOCKED_QUERY`).
 */

/**
 * A window the game does not play in: portrait under 600 px wide (a phone held upright). The same text is the media query of the
 * rotate-device notice in `BoardShell.css`. Tablets and desktop windows play in either orientation.
 */
export const PORTRAIT_BLOCKED_QUERY = '(orientation: portrait) and (max-width: 599px)';

/**
 * The phone tier (up to 720 px wide or up to 500 px tall): the HUD keeps to what a player has to act on there. Routine events (another
 * player's balance changes, the ticker) are left to the cards and the Journal. Same breakpoints as `hud.css`.
 */
export const COMPACT_HUD_QUERY = '(max-width: 720px), (max-height: 500px)';

/** A phone held sideways, or any window too short for the full deed card beside the decision. */
export const SHORT_VIEWPORT_QUERY = '(orientation: landscape) and (max-height: 31rem)';
