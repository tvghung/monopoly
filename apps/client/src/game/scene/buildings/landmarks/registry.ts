import { buildBietThuVenSong } from './bietThuVenSong';
import { buildBitexco } from './bitexco';
import { buildCauAnhSao } from './cauAnhSao';
import { buildCauVang } from './cauVang';
import { buildChoNoiCaiRang } from './choNoiCaiRang';
import { buildChuaCau } from './chuaCau';
import { buildChuaTranQuoc } from './chuaTranQuoc';
import { buildDienGio } from './dienGio';
import { buildDoiCatMuiNe } from './doiCatMuiNe';
import { buildGaDaLat } from './gaDaLat';
import { buildHaiDangVungTau } from './haiDangVungTau';
import { buildLandmark81 } from './landmark81';
import { buildMuiCaMau } from './muiCaMau';
import { buildNgoMon } from './ngoMon';
import { buildNhaDaiEDe } from './nhaDaiEDe';
import { buildNhaHatLonHaiPhong } from './nhaHatLonHaiPhong';
import { buildRuongBacThang } from './ruongBacThang';
import { buildTauCauMuc } from './tauCauMuc';
import { buildThapDoi } from './thapDoi';
import { buildThapTramHuong } from './thapTramHuong';
import { buildUbndTphcm } from './ubndTphcm';
import { buildVinhHaLong } from './vinhHaLong';
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
 * All 22 landmarks, in tile order: the three pilots of gate G5a (a tall slim tower, a delicate roof, a curved structure) and the
 * nineteen built after them in four groups. A street whose builder fails still shows today's hotel box (`hasLandmark`).
 */
export const LANDMARKS: readonly LandmarkDefinition[] = [
  { ...planned(1), build: buildMuiCaMau },
  { ...planned(3), build: buildDienGio },
  { ...planned(6), build: buildNhaDaiEDe },
  { ...planned(8), build: buildChoNoiCaiRang },
  { ...planned(9), build: buildNhaHatLonHaiPhong },
  { ...planned(11), build: buildGaDaLat },
  { ...planned(13), build: buildChuaCau },
  { ...planned(14), build: buildNgoMon },
  { ...planned(16), build: buildDoiCatMuiNe },
  { ...planned(18), build: buildRuongBacThang },
  { ...planned(19), build: buildThapTramHuong },
  { ...planned(21), build: buildHaiDangVungTau },
  { ...planned(23), build: buildThapDoi },
  { ...planned(24), build: buildCauVang },
  { ...planned(26), build: buildVinhHaLong },
  { ...planned(27), build: buildChuaTranQuoc },
  { ...planned(29), build: buildTauCauMuc },
  { ...planned(31), build: buildCauAnhSao },
  { ...planned(32), build: buildBietThuVenSong },
  { ...planned(34), build: buildUbndTphcm },
  { ...planned(37), build: buildBitexco },
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
