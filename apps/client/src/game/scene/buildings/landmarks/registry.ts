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
import { LANDMARK_PLAN, type PlannedLandmark } from './plan';
import type { LandmarkDefinition, LandmarkGeometry } from './types';

export { LANDMARK_PLAN };

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
