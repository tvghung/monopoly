import { bevelBox, box, cone } from '../kit/lowPolyKit';
import { assembleLandmark } from './assemble';
import type { LandmarkGeometry } from './types';

/**
 * Tile 39, Landmark 81 (plan 05 §8.3): a bundle of stepped, slender glass prisms like bamboo canes, a white podium and a
 * crowned tip. Blue-gray glass, white mullions, one warm light at the top.
 */
const GLASS = '#8FB0D0';
const GLASS_DARK = '#7595B6';
const GLASS_LIGHT = '#A9C6E0';
const WHITE = '#F2F4F6';
const PODIUM = '#E4EAEF';

export function buildLandmark81(): LandmarkGeometry {
  const podiumTop = 0.1;
  const opaque = [
    box(1.0, podiumTop, 0.62, PODIUM),
    // Mullion bands round the core tower, one per setback and between.
    box(0.37, 0.03, 0.37, WHITE, { position: [0, 0.34, 0] }),
    box(0.37, 0.03, 0.37, WHITE, { position: [0, 0.6, 0] }),
    box(0.37, 0.03, 0.37, WHITE, { position: [0, 0.88, 0] }),
    box(0.33, 0.03, 0.33, WHITE, { position: [0, 1.2, 0] }),
    box(0.27, 0.03, 0.27, WHITE, { position: [0, 1.44, 0] }),
    // The crown: a four-sided spire.
    cone(0.12, 0.2, 4, WHITE, { position: [0, 1.8, 0] }),
    // Mullions on the flanking canes.
    box(0.23, 0.025, 0.23, WHITE, { position: [-0.3, 0.7, 0.05] }),
    box(0.23, 0.025, 0.23, WHITE, { position: [-0.3, 1.0, 0.05] }),
    box(0.21, 0.025, 0.21, WHITE, { position: [0.28, 0.7, -0.04] }),
  ];
  const glass = [
    // The core: three stepped sections.
    bevelBox(0.34, 0.78, 0.34, 0.02, GLASS, { position: [0, podiumTop, 0] }),
    bevelBox(0.3, 0.56, 0.3, 0.02, GLASS_LIGHT, { position: [0, 0.88, 0] }),
    bevelBox(0.24, 0.36, 0.24, 0.02, GLASS, { position: [0, 1.44, 0] }),
    // The canes around it.
    bevelBox(0.2, 1.2, 0.2, 0.02, GLASS_DARK, { position: [-0.3, podiumTop, 0.05] }),
    bevelBox(0.18, 0.95, 0.18, 0.02, GLASS_LIGHT, { position: [0.28, podiumTop, -0.04] }),
    bevelBox(0.16, 0.7, 0.16, 0.02, GLASS, { position: [0, podiumTop, 0.27] }),
  ];
  const emissive = [box(0.05, 0.05, 0.05, '#FFE08A', { position: [0, 1.95, 0] })];
  return assembleLandmark({ opaque, glass, emissive });
}
