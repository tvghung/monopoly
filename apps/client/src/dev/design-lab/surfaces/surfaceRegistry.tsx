import { CARD_SURFACES } from './cardSurfaces';
import { DECISION_SURFACES } from './decisionSurfaces';
import { ENTRY_SURFACES } from './entrySurfaces';
import { INSPECTION_SURFACES } from './inspectionSurfaces';
import { LOBBY_SURFACES } from './lobbySurfaces';
import { SCREEN_SURFACES } from './screenSurfaces';
import { SETTINGS_SURFACES } from './settingsSurfaces';
import type { SurfaceFixture } from './surfaceKit';
import { VICTORY_SURFACES } from './victorySurfaces';

export type { SurfaceFixture } from './surfaceKit';

/**
 * Every real-component surface of plan 04 (plan 04 §9), selectable with `&surface=<id>`. Each cluster keeps its own
 * fixtures in its own file; this list only concatenates them. The capture manifest (`e2e/visual/captures.ts`) mirrors the
 * ids, and `surfaceRegistry.test.tsx` keeps the two in step.
 */
export const SURFACES: readonly SurfaceFixture[] = [
  ...ENTRY_SURFACES,
  ...LOBBY_SURFACES,
  ...SETTINGS_SURFACES,
  ...DECISION_SURFACES,
  ...INSPECTION_SURFACES,
  ...CARD_SURFACES,
  ...VICTORY_SURFACES,
  ...SCREEN_SURFACES,
];

export function findSurface(id: string | null): SurfaceFixture | undefined {
  return id === null ? undefined : SURFACES.find(surface => surface.id === id);
}
