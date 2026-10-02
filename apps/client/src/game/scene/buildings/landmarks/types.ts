import type * as THREE from 'three';

/**
 * The built geometry of one landmark (plan 05 §8.3), authored in tile-local space: the footprint is centered on the middle of the
 * tile's upper art panel and the landmark stands on y = 0 (the plinth top). At most one geometry per material, so a landmark
 * costs one opaque draw plus an optional glass and an optional emissive draw.
 */
export interface LandmarkGeometry {
  opaque: THREE.BufferGeometry;
  glass?: THREE.BufferGeometry;
  emissive?: THREE.BufferGeometry;
  /** Number of leading vertices of `opaque` that belong to the plinth rim (recolored with the owner). */
  rimVertexCount: number;
  /** Measured from the landmark's own parts, plinth excluded: `[width, depth]` on the ground. */
  footprint: readonly [number, number];
  /** Measured height above the plinth top. */
  height: number;
  /** The landmark's own bounding box, plinth excluded, as `[x, y, z]` corners. */
  bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  /** All triangles, plinth included. */
  triangles: number;
}

export type LandmarkHeightClass = 'standard' | 'slim';

export interface LandmarkDefinition {
  tileId: number;
  /** File-name style id, `chua-cau`. */
  slug: string;
  /** Vietnamese name shown in the deed card and the tile button label. */
  name: string;
  heightClass: LandmarkHeightClass;
  /** The `Max H` of the plan 05 §8.3 table; a test keeps the built height under it. */
  maxHeight: number;
  build: () => LandmarkGeometry;
}
