import type { ReactNode } from 'react';
import SurfaceProviders, { makeSurfaceState, SurfaceSettingsProvider, type SurfaceStateOptions } from './SurfaceProviders';

/**
 * The real components of plan 04, each with the state it needs, selectable with `&surface=<id>` (plan 04 §9).
 * Every surface that plan 04 restyles has an entry in one of the `*Surfaces.tsx` files next to this one; the G4 captures
 * and the before / after comparisons read the combined list in `surfaceRegistry.tsx`.
 */
export interface SurfaceFixture {
  /** Unique, kebab-case; it is the `&surface=` value and part of the capture file name. */
  id: string;
  label: string;
  group: 'Pre-game' | 'Decisions' | 'Inspection' | 'Card' | 'Victory' | 'Settings' | 'Screens';
  render: () => ReactNode;
}

export const noop = () => undefined;

/** A game-state surface: the component inside the providers of the fixture room (see `makeSurfaceState`). */
export function withState(options: SurfaceStateOptions, children: ReactNode): ReactNode {
  return <SurfaceProviders value={makeSurfaceState(options)}>{children}</SurfaceProviders>;
}

/** Two brown streets owned by the first player, one with a house. */
export const OWNED_PAIR = {
  1: { id: 'player-a', color: 'red' as const, houses: 1 },
  3: { id: 'player-a', color: 'red' as const, houses: 0 },
};

export { SurfaceProviders, SurfaceSettingsProvider, makeSurfaceState };
export type { SurfaceStateOptions };
