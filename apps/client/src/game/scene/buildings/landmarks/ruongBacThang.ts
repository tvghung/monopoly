import { box, cylinder, gableRoof } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import { WOOD, tree } from './parts';
import type { LandmarkGeometry } from './types';

/**
 * Tile 18, ruộng bậc thang (plan 05 §8.3): a hillside of rice terraces seen as five stepped tiers, each a different crop color
 * (young green, ripe gold, a flooded field), with a small stilt hut at the top. Each step is shifted a little toward the back
 * so the front reads as a staircase of fields.
 */
const EARTH = '#8B6B3F';
const THATCH = '#C9A24E';
const TIERS = [
  { radius: 0.58, color: '#6FAF46' },
  { radius: 0.49, color: '#E0C255' },
  { radius: 0.4, color: '#9CCBD6' },
  { radius: 0.31, color: '#7DB84A' },
  { radius: 0.22, color: '#D9B340' },
] as const;
const TIER_HEIGHT = 0.13;
const SEGMENTS = 10;
const STEP_X = -0.05;
const STEP_Z = -0.08;

export function buildRuongBacThang(): LandmarkGeometry {
  const opaque = [
    // A dark footing so the lowest step stands out from the plinth.
    cylinder(0.6, 0.62, 0.03, SEGMENTS, EARTH),
  ];
  let top = 0.03;
  TIERS.forEach(({ radius, color }, index) => {
    opaque.push(cylinder(radius * 0.98, radius, TIER_HEIGHT, SEGMENTS, color, { position: [STEP_X * index, top, STEP_Z * index] }));
    top += TIER_HEIGHT;
  });
  const hutX = STEP_X * (TIERS.length - 1);
  const hutZ = STEP_Z * (TIERS.length - 1);
  opaque.push(
    // The stilt hut: four short posts, a wall box and a thatch roof, big enough to read from the board camera.
    ...[-0.07, 0.07].flatMap(x => [-0.05, 0.05].map(z => box(0.02, 0.06, 0.02, WOOD, { position: [hutX + x, top, hutZ + z] }))),
    box(0.2, 0.1, 0.14, WOOD, { position: [hutX, top + 0.06, hutZ] }),
    gableRoof(0.28, 0.2, 0.1, THATCH, { position: [hutX, top + 0.16, hutZ] }),
    // A tree on the second step and one on the lowest, for scale and for a bit of green against the gold.
    ...tree(0.34, 0.2, 0.1, '#4F8A4A', 0.03 + TIER_HEIGHT),
    ...tree(-0.36, 0.22, 0.08, '#3F7A44', 0.03),
  );
  return assembleLandmark({ opaque });
}
