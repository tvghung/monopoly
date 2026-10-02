import { LANDMARK_PLAN } from '../../scene/buildings/landmarks/plan';
import { publicAssetUrl } from '../events/cardVisuals';

/**
 * The 2D face of a street's landmark (plan 05 §8.5): its Vietnamese name and a flat picture in `public/art/landmarks/`. The
 * deed card shows both in its header, and the name is read by assistive technology. The 3D landmark of the same street is the
 * hotel tier on the board; this registry never decides when a street has a hotel.
 */
export interface LandmarkVisual {
  tileId: number;
  landmarkName: string;
  artUrl: string;
}

export const LANDMARK_VISUALS: readonly LandmarkVisual[] = LANDMARK_PLAN.map(({ tileId, name }) => ({
  tileId,
  landmarkName: name,
  artUrl: publicAssetUrl(`art/landmarks/${tileId}.svg`),
}));

const byTile = new Map(LANDMARK_VISUALS.map(visual => [visual.tileId, visual]));

/** The landmark picture and name of a street tile, or undefined for a tile that has none (stations, utilities, specials). */
export function getLandmarkVisual(tileId: number): LandmarkVisual | undefined {
  return byTile.get(tileId);
}

/** "Khách sạn · Chùa Cầu": how the hotel of a street is named for assistive technology; null when the tile has no landmark. */
export function getLandmarkHotelLabel(tileId: number): string | null {
  const visual = byTile.get(tileId);
  return visual ? `Khách sạn · ${visual.landmarkName}` : null;
}
