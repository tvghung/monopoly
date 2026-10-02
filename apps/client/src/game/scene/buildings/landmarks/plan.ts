import type { LandmarkHeightClass } from './types';

/**
 * The landmark plan as plain data: no geometry, no three.js. The 3D registry, the deed card art registry and the accessible
 * names all read it, so a landmark has one name and one place in the code.
 */
export interface PlannedLandmark {
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

const byTile = new Map(LANDMARK_PLAN.map(entry => [entry.tileId, entry]));

/** The planned landmark of a street tile, or undefined for a tile that has none. */
export function getPlannedLandmark(tileId: number): PlannedLandmark | undefined {
  return byTile.get(tileId);
}
