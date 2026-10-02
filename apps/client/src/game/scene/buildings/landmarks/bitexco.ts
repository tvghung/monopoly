import { box, cone, cylinder, lathe, type Vec2 } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import type { LandmarkGeometry } from './types';

/**
 * Tile 37, tháp Bitexco (plan 05 §8.3): the lotus-bud glass tower. One glass shell that swells a little above the base and then
 * narrows to a rounded top (a lathe profile), a darker core seen through it, a white footing on a round podium, a round helipad
 * jutting out near the top, and a slim spire. The slim class gives it 1.9; this one stops at 1.86.
 */
const GLASS = '#A5D3E3';
const CORE = '#8FA9BC';
const PODIUM = '#E4EAEF';
const WHITE = '#F2F4F6';
const ORANGE = '#E07B2A';
const PAD = '#C9CED3';

/** The glass shell, as radius and height from its foot: wide and nearly straight for the first half, then a bud. */
const BUD: readonly Vec2[] = [[0.26, 0], [0.285, 0.14], [0.27, 0.55], [0.23, 1.0], [0.17, 1.34], [0.1, 1.55], [0.045, 1.62]];

export function buildBitexco(): LandmarkGeometry {
  const podiumTop = 0.1;
  const shellAt = podiumTop + 0.04;
  const padY = 1.22;
  const opaque = [
    cylinder(0.5, 0.54, podiumTop, 12, PODIUM),
    cylinder(0.3, 0.32, 0.04, 12, WHITE, { position: [0, podiumTop, 0] }),
    // The core seen through the glass: narrower than the shell all the way up, so it never pokes out.
    cylinder(0.08, 0.2, 1.4, 8, CORE, { position: [0, shellAt, 0] }),
    // The helipad: an orange ring with a grey disc, carried on a strut out of the tower.
    box(0.22, 0.03, 0.06, WHITE, { position: [0.18, padY - 0.03, 0] }),
    cylinder(0.14, 0.14, 0.02, 10, ORANGE, { position: [0.27, padY, 0] }),
    cylinder(0.11, 0.11, 0.012, 10, PAD, { position: [0.27, padY + 0.02, 0] }),
    cone(0.014, 0.12, 4, WHITE, { position: [0, shellAt + 1.62 - 0.02, 0] }),
  ];
  const glass = [lathe(BUD, 12, GLASS, { position: [0, shellAt, 0] })];
  return assembleLandmark({ opaque, glass });
}
