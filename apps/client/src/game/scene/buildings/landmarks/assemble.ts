import * as THREE from 'three';
import { measureGeometry, mergeKit, triangleCount } from '../kit/lowPolyKit';
import { buildPlinthParts } from './plinth';
import type { LandmarkGeometry } from './types';

export interface LandmarkParts {
  opaque: THREE.BufferGeometry[];
  glass?: THREE.BufferGeometry[];
  emissive?: THREE.BufferGeometry[];
}

/**
 * Merges the parts of each material into one geometry, adds the plinth to the opaque one (rim vertices first, so they can be
 * recolored), and measures the landmark itself: footprint and height exclude the plinth, which lies below y = 0.
 */
export function assembleLandmark(parts: LandmarkParts): LandmarkGeometry {
  const measured = [...parts.opaque, ...(parts.glass ?? []), ...(parts.emissive ?? [])].map(measureGeometry);
  const min = [0, 1, 2].map(axis => Math.min(...measured.map(box => box.min[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...measured.map(box => box.max[axis])));

  const plinth = buildPlinthParts();
  const rimVertexCount = plinth.rim.reduce((sum, part) => sum + part.getAttribute('position').count, 0);
  const opaque = mergeKit([...plinth.rim, ...plinth.slab, ...parts.opaque]);
  const glass = parts.glass && parts.glass.length > 0 ? mergeKit(parts.glass) : undefined;
  const emissive = parts.emissive && parts.emissive.length > 0 ? mergeKit(parts.emissive) : undefined;
  return {
    opaque,
    glass,
    emissive,
    rimVertexCount,
    footprint: [max[0] - min[0], max[2] - min[2]],
    height: max[1],
    bounds: { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] },
    triangles: triangleCount(opaque) + (glass ? triangleCount(glass) : 0) + (emissive ? triangleCount(emissive) : 0),
  };
}

const rimColor = new THREE.Color();

/** Paints the rim of a landmark's own copy of its geometry in the owner's color. */
export function recolorRim(geometry: THREE.BufferGeometry, rimVertexCount: number, color: THREE.ColorRepresentation): void {
  const attribute = geometry.getAttribute('color');
  rimColor.set(color);
  for (let index = 0; index < rimVertexCount; index += 1) attribute.setXYZ(index, rimColor.r, rimColor.g, rimColor.b);
  attribute.needsUpdate = true;
}

