import type * as THREE from 'three';
import { blob, box, cone, cylinder, prism, type Placement, type Vec2, type Vec3 } from '../kit/lowPolyKit';

/**
 * Small shared pieces the landmark builders compose (plan 05 §8.3): water, trees, palms, boats and a curved strip. Each returns
 * kit parts standing on y = 0 at the given ground position, so a builder just spreads them into its opaque list.
 */
export const WATER = '#4A9FB0';
export const SAND = '#E9C58B';
export const LEAF = '#4F8A4A';
export const LEAF_DARK = '#3F7A44';
export const TRUNK = '#7B5A3C';
export const WOOD = '#8D5B3E';
export const WHITE = '#F4F1EA';

/** A shallow slab of water, `width` along X and `depth` along Z, 0.03 thick. */
export function waterPlate(width: number, depth: number, color: string = WATER, placement?: Placement): THREE.BufferGeometry {
  return box(width, 0.03, depth, color, placement);
}

/** A small round tree: a short trunk and two leaf blobs (about 70 triangles). */
export function tree(x: number, z: number, height: number, leaf: string = LEAF, y = 0): THREE.BufferGeometry[] {
  return [
    cylinder(0.014, 0.024, height, 5, TRUNK, { position: [x, y, z] }),
    blob(height * 0.55, 0, leaf, { position: [x, y + height + height * 0.2, z] }),
    blob(height * 0.38, 0, leaf, { position: [x + height * 0.4, y + height * 0.85, z + height * 0.15] }),
  ];
}

/** A palm: a leaning trunk and five drooping fronds (about 60 triangles). `lean` tilts the trunk about Z, in radians. */
export function palm(x: number, z: number, height: number, lean = 0.12, y = 0): THREE.BufferGeometry[] {
  const topX = x - Math.sin(lean) * height;
  const topY = y + Math.cos(lean) * height;
  const parts = [cylinder(0.014, 0.026, height, 5, TRUNK, { position: [x, y, z], rotation: [0, 0, lean] })];
  for (let frond = 0; frond < 5; frond += 1) {
    const heading = (frond / 5) * Math.PI * 2;
    // A cone lying on its side points along +X; spun about Y it points anywhere round the crown, drooping by 0.3.
    parts.push(cone(0.05, 0.24, 4, frond % 2 === 0 ? LEAF : LEAF_DARK, {
      position: [topX, topY, z],
      rotation: [0, -heading, -Math.PI / 2 + 0.3],
    }));
  }
  return parts;
}

/** A boat hull seen from above: pointed at both ends, `length` along X, drawn on the ground at `position` and turned by `heading`. */
export function boatHull(length: number, width: number, height: number, color: string, position: Vec3 = [0, 0, 0], heading = 0): THREE.BufferGeometry {
  const half = length / 2;
  const shoulder = width / 2;
  const outline: Vec2[] = [
    [-half, 0], [-half + length * 0.18, shoulder], [half - length * 0.18, shoulder], [half, 0], [half - length * 0.18, -shoulder], [-half + length * 0.18, -shoulder],
  ];
  return prism(outline, height, color, { position, rotation: [0, heading, 0] });
}

/** Points of a curved strip (a walkway or a bridge deck): an upper and a lower parabola of the same span, for `extrude`. */
export function arcStrip(span: number, rise: number, thickness: number, steps: number): Vec2[] {
  const upper: Vec2[] = [];
  const lower: Vec2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = (t - 0.5) * span;
    const y = rise * (1 - (2 * t - 1) ** 2);
    upper.push([x, y + thickness]);
    lower.push([x, y]);
  }
  return [...lower, ...upper.reverse()];
}
