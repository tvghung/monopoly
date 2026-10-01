import { buildCauVang } from './cauVang';
import { buildChuaCau } from './chuaCau';
import { buildLandmark81 } from './landmark81';
import type { LandmarkDefinition, LandmarkGeometry, LandmarkHeightClass } from './types';

interface PlannedLandmark {
  tileId: number;
  slug: string;
  /** Vietnamese name, shown on the deed card and read by assistive technology. */
  name: string;
  heightClass: LandmarkHeightClass;
  /** The `Max H` column of the plan 05 §8.3 table. */
  maxHeight: number;
}

/**
 * The 22 landmarks of plan 05 §8.3, one per street, in tile order. The reviewer may replace an entry (OD-05-6); every
 * replacement is recorded in the plan's progress log. `slim` means a narrow element carries the height: the table gives three
 * landmarks a `Max H` above the 1.2 of a standard landmark, and they take the slim class (up to 2.0) for that.
 */
export const LANDMARK_PLAN: readonly PlannedLandmark[] = [
  { tileId: 1, slug: 'mui-ca-mau', name: 'Mũi Cà Mau', heightClass: 'standard', maxHeight: 1.0 },
  { tileId: 3, slug: 'dien-gio', name: 'Cánh đồng điện gió', heightClass: 'slim', maxHeight: 1.6 },
  { tileId: 6, slug: 'nha-dai-e-de', name: 'Nhà dài Ê Đê', heightClass: 'standard', maxHeight: 0.9 },
  { tileId: 8, slug: 'cho-noi-cai-rang', name: 'Chợ nổi Cái Răng', heightClass: 'standard', maxHeight: 0.9 },
  { tileId: 9, slug: 'nha-hat-lon-hai-phong', name: 'Nhà hát lớn Hải Phòng', heightClass: 'standard', maxHeight: 1.0 },
  { tileId: 11, slug: 'ga-da-lat', name: 'Ga Đà Lạt', heightClass: 'standard', maxHeight: 1.1 },
  { tileId: 13, slug: 'chua-cau', name: 'Chùa Cầu', heightClass: 'standard', maxHeight: 0.9 },
  { tileId: 14, slug: 'ngo-mon', name: 'Ngọ Môn', heightClass: 'standard', maxHeight: 1.1 },
  { tileId: 16, slug: 'doi-cat-mui-ne', name: 'Đồi cát và thuyền thúng', heightClass: 'standard', maxHeight: 0.8 },
  { tileId: 18, slug: 'ruong-bac-thang', name: 'Ruộng bậc thang', heightClass: 'standard', maxHeight: 1.0 },
  { tileId: 19, slug: 'thap-tram-huong', name: 'Tháp Trầm Hương', heightClass: 'slim', maxHeight: 1.4 },
  { tileId: 21, slug: 'hai-dang-vung-tau', name: 'Hải đăng Vũng Tàu', heightClass: 'slim', maxHeight: 1.6 },
  { tileId: 23, slug: 'thap-doi', name: 'Tháp Đôi', heightClass: 'standard', maxHeight: 1.2 },
  { tileId: 24, slug: 'cau-vang', name: 'Cầu Vàng', heightClass: 'standard', maxHeight: 1.1 },
  { tileId: 26, slug: 'vinh-ha-long', name: 'Vịnh Hạ Long', heightClass: 'slim', maxHeight: 1.3 },
  { tileId: 27, slug: 'chua-tran-quoc', name: 'Chùa Trấn Quốc', heightClass: 'slim', maxHeight: 1.6 },
  { tileId: 29, slug: 'tau-cau-muc', name: 'Bãi biển và tàu câu mực', heightClass: 'standard', maxHeight: 1.1 },
  { tileId: 31, slug: 'cau-anh-sao', name: 'Cầu Ánh Sao', heightClass: 'standard', maxHeight: 0.8 },
  { tileId: 32, slug: 'biet-thu-ven-song', name: 'Biệt thự ven sông', heightClass: 'standard', maxHeight: 0.9 },
  { tileId: 34, slug: 'ubnd-tphcm', name: 'Trụ sở UBND TP.HCM', heightClass: 'slim', maxHeight: 1.3 },
  { tileId: 37, slug: 'bitexco', name: 'Tháp Bitexco', heightClass: 'slim', maxHeight: 1.9 },
  { tileId: 39, slug: 'landmark-81', name: 'Landmark 81', heightClass: 'slim', maxHeight: 2.0 },
];

const planned = (tileId: number): PlannedLandmark => {
  const entry = LANDMARK_PLAN.find(candidate => candidate.tileId === tileId);
  if (!entry) throw new Error(`No planned landmark for tile ${tileId}`);
  return entry;
};

/**
 * The landmarks built so far. A street whose landmark is not here yet shows today's hotel: the three pilots of gate G5a come
 * first (the three hardest styles: a tall slim tower, a delicate roof, a curved structure), then the other nineteen.
 */
export const LANDMARKS: readonly LandmarkDefinition[] = [
  { ...planned(13), build: buildChuaCau },
  { ...planned(24), build: buildCauVang },
  { ...planned(39), build: buildLandmark81 },
];

const byTile = new Map(LANDMARKS.map(landmark => [landmark.tileId, landmark]));
const built = new Map<number, LandmarkGeometry>();
const failed = new Set<number>();

export function getLandmarkDefinition(tileId: number): LandmarkDefinition | undefined {
  return byTile.get(tileId);
}

/**
 * The geometry of a tile's landmark, built on first use and cached for the life of the page. A builder that throws is logged
 * once and treated as missing, so the street keeps showing today's hotel instead of failing the whole scene (plan 05 §7.7).
 */
export function getLandmarkGeometry(tileId: number): LandmarkGeometry | undefined {
  const cached = built.get(tileId);
  if (cached) return cached;
  if (failed.has(tileId)) return undefined;
  const definition = byTile.get(tileId);
  if (!definition) return undefined;
  try {
    const geometry = definition.build();
    built.set(tileId, geometry);
    return geometry;
  } catch (error) {
    failed.add(tileId);
    console.warn(`[scene] landmark "${definition.slug}" could not be built; the hotel box is shown instead.`, error);
    return undefined;
  }
}

/** True when the street has a landmark that built successfully; otherwise it shows the hotel box. */
export function hasLandmark(tileId: number): boolean {
  return getLandmarkGeometry(tileId) !== undefined;
}

export function resetLandmarkCacheForTests(): void {
  built.forEach(geometry => {
    geometry.opaque.dispose();
    geometry.glass?.dispose();
    geometry.emissive?.dispose();
  });
  built.clear();
  failed.clear();
}
