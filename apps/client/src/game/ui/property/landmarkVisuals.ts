import { LANDMARK_PLAN } from '../../scene/buildings/landmarks/plan';
import { publicAssetUrl } from '../events/cardVisuals';
import { translate, type Language } from '../../../i18n/I18n';

/**
 * The 2D face of a street's landmark (plan 05 §8.5): its name and a flat picture in `public/art/landmarks/`. The
 * deed card shows both in its header, and the name is read by assistive technology. The names live in `LANDMARK_PLAN`
 * (`name` Vietnamese, `nameEn` English); components ask for the one in the player's language through `getLandmarkName`.
 * The 3D landmark of the same street is the hotel tier on the board; this registry never decides when a street has a hotel.
 */
export interface LandmarkVisual {
  tileId: number;
  /** Vietnamese name (canonical). Use `getLandmarkName` to show the name in the player's language. */
  landmarkName: string;
  /** English name. */
  landmarkNameEn: string;
  artUrl: string;
}

export const LANDMARK_VISUALS: readonly LandmarkVisual[] = LANDMARK_PLAN.map(({ tileId, name, nameEn }) => ({
  tileId,
  landmarkName: name,
  landmarkNameEn: nameEn,
  artUrl: publicAssetUrl(`art/landmarks/${tileId}.svg`),
}));

const byTile = new Map(LANDMARK_VISUALS.map(visual => [visual.tileId, visual]));

/** The landmark picture and name of a street tile, or undefined for a tile that has none (stations, utilities, specials). */
export function getLandmarkVisual(tileId: number): LandmarkVisual | undefined {
  return byTile.get(tileId);
}

/** The landmark's name in the given language: the one place that picks between `landmarkName` and `landmarkNameEn`. */
export function getLandmarkName(visual: LandmarkVisual, language: Language): string {
  return language === 'en' ? visual.landmarkNameEn : visual.landmarkName;
}

/** "Khách sạn · Chùa Cầu" / "Hotel · Chùa Cầu Temple": how the hotel of a street is named for assistive technology; null when the tile has no landmark. */
export function getLandmarkHotelLabel(tileId: number, language: Language = 'vi'): string | null {
  const visual = byTile.get(tileId);
  return visual ? translate('board.hotelLandmark', language, { landmark: getLandmarkName(visual, language) }) : null;
}
