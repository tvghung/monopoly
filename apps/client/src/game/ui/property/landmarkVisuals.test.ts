import { colorGroups } from '@monopoly/shared';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANDMARK_PLAN } from '../../scene/buildings/landmarks/plan';
import { getLandmarkHotelLabel, getLandmarkName, getLandmarkVisual, LANDMARK_VISUALS } from './landmarkVisuals';

/** The artwork file in `public/`. The URL is built from a variable so Vite leaves it alone instead of turning it into an asset reference. */
const artworkFile = (tileId: number): string => {
  const path = `../../../../public/art/landmarks/${tileId}.svg`;
  return fileURLToPath(new URL(path, import.meta.url));
};

const STREETS = Object.values(colorGroups).flat().sort((a, b) => a - b);

describe('landmark visual registry', () => {
  it('covers exactly the 22 street tiles, one picture each, in tile order', () => {
    expect(LANDMARK_VISUALS.map(visual => visual.tileId)).toEqual(STREETS);
    expect(LANDMARK_VISUALS).toHaveLength(22);
  });

  it('takes its names from the landmark plan, all different, and points at the public art folder', () => {
    for (const visual of LANDMARK_VISUALS) {
      expect(visual.landmarkName, `tile ${visual.tileId}`).toBe(LANDMARK_PLAN.find(entry => entry.tileId === visual.tileId)?.name);
      expect(visual.artUrl).toMatch(new RegExp(`/art/landmarks/${visual.tileId}\\.svg$`, 'u'));
    }
    expect(new Set(LANDMARK_VISUALS.map(visual => visual.landmarkName)).size).toBe(22);
  });

  it('has a flat, text-free 160 by 160 SVG file for every street', () => {
    for (const visual of LANDMARK_VISUALS) {
      const file = artworkFile(visual.tileId);
      expect(existsSync(file), `tile ${visual.tileId}`).toBe(true);
      const source = readFileSync(file, 'utf8');
      expect(source, `tile ${visual.tileId}`).toMatch(/viewBox="0 0 160 160"/u);
      expect(source, `tile ${visual.tileId}`).not.toMatch(/<(?:script|text|foreignObject|image)\b/iu);
    }
  });

  it('returns nothing for a tile with no landmark, and names a hotel by its landmark', () => {
    expect(getLandmarkVisual(5)).toBeUndefined();
    expect(getLandmarkVisual(0)).toBeUndefined();
    expect(getLandmarkVisual(13)?.landmarkName).toBe('Chùa Cầu');
    expect(getLandmarkHotelLabel(13)).toBe('Khách sạn · Chùa Cầu');
    expect(getLandmarkHotelLabel(13, 'vi')).toBe('Khách sạn · Chùa Cầu');
    expect(getLandmarkHotelLabel(13, 'en')).toBe('Hotel · Chùa Cầu Temple');
    expect(getLandmarkHotelLabel(5)).toBeNull();
    expect(getLandmarkHotelLabel(5, 'en')).toBeNull();
  });

  it('names all 22 landmarks in both languages: the Vietnamese name never changes, the English one keeps its proper nouns', () => {
    const names: ReadonlyArray<readonly [number, string, string]> = [
      [1, 'Mũi Cà Mau', 'Cà Mau Cape'],
      [3, 'Cánh đồng điện gió', 'Wind Farm'],
      [6, 'Nhà dài Ê Đê', 'Ê Đê Longhouse'],
      [8, 'Chợ nổi Cái Răng', 'Cái Răng Floating Market'],
      [9, 'Nhà hát lớn Hải Phòng', 'Hải Phòng Opera House'],
      [11, 'Ga Đà Lạt', 'Đà Lạt Railway Station'],
      [13, 'Chùa Cầu', 'Chùa Cầu Temple'],
      [14, 'Ngọ Môn', 'Ngọ Môn Gate'],
      [16, 'Đồi cát và thuyền thúng', 'Sand Dunes and Basket Boats'],
      [18, 'Ruộng bậc thang', 'Terraced Rice Fields'],
      [19, 'Tháp Trầm Hương', 'Trầm Hương Tower'],
      [21, 'Hải đăng Vũng Tàu', 'Vũng Tàu Lighthouse'],
      [23, 'Tháp Đôi', 'Twin Towers'],
      [24, 'Cầu Vàng', 'Golden Bridge'],
      [26, 'Vịnh Hạ Long', 'Hạ Long Bay'],
      [27, 'Chùa Trấn Quốc', 'Trấn Quốc Temple'],
      [29, 'Bãi biển và tàu câu mực', 'Beach and Squid Fishing Boats'],
      [31, 'Cầu Ánh Sao', 'Ánh Sao Bridge'],
      [32, 'Biệt thự ven sông', 'Riverside Villa'],
      [34, 'Trụ sở UBND TP.HCM', "HCMC People's Committee Building"],
      [37, 'Tháp Bitexco', 'Bitexco Tower'],
      [39, 'Landmark 81', 'Landmark 81'],
    ];
    expect(names.map(([tileId]) => tileId)).toEqual(STREETS);
    for (const [tileId, vi, en] of names) {
      const visual = getLandmarkVisual(tileId);
      expect(visual, `tile ${tileId}`).toBeDefined();
      expect(getLandmarkName(visual!, 'vi'), `tile ${tileId} vi`).toBe(vi);
      expect(getLandmarkName(visual!, 'en'), `tile ${tileId} en`).toBe(en);
    }
    expect(new Set(LANDMARK_VISUALS.map(visual => visual.landmarkNameEn)).size).toBe(22);
  });
});
