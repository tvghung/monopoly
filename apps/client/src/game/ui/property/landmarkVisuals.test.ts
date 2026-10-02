import { colorGroups } from '@monopoly/shared';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANDMARK_PLAN } from '../../scene/buildings/landmarks/plan';
import { getLandmarkHotelLabel, getLandmarkVisual, LANDMARK_VISUALS } from './landmarkVisuals';

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
    expect(getLandmarkHotelLabel(5)).toBeNull();
  });
});
