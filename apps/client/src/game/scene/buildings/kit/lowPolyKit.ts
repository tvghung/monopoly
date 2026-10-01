import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The low-poly kit of visual overhaul V2 (plan 05 §8.1 and §9): pure, deterministic builders for the stylized "toy diorama"
 * buildings. Every builder returns a faceted (non-indexed) geometry with exactly three attributes, `position`, `normal` and
 * `color`, so any set of parts can be merged into one draw call. Authoring convention: Y is up, a part stands on `y = 0` and
 * is centered on `x = 0, z = 0`, and `placement` moves it afterwards.
 */

export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

export interface Placement {
  position?: Vec3;
  /** Euler XYZ in radians. */
  rotation?: Vec3;
  scale?: number | Vec3;
}

export type KitColor = THREE.ColorRepresentation;

const KIT_ATTRIBUTES = ['position', 'normal', 'color'] as const;

/** Moves, rotates and scales a finished part (for example a part that was itself rotated while it was built). */
export function place(geometry: THREE.BufferGeometry, placement: Placement): THREE.BufferGeometry {
  return applyPlacement(geometry, placement);
}

function applyPlacement(geometry: THREE.BufferGeometry, placement?: Placement): THREE.BufferGeometry {
  if (!placement) return geometry;
  const { position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 } = placement;
  const scaleVector = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    scaleVector,
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

/** Writes one linear-space color to every vertex (`THREE.Color` converts an sRGB hex to the working space). */
export function paintGeometry(geometry: THREE.BufferGeometry, color: KitColor): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const rgb = new THREE.Color(color);
  const values = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    values[index * 3] = rgb.r;
    values[index * 3 + 1] = rgb.g;
    values[index * 3 + 2] = rgb.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

/** Turns a three.js geometry into a kit part: faceted, uv-free, painted, placed. */
function finish(source: THREE.BufferGeometry, color: KitColor, placement?: Placement): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  for (const name of Object.keys(geometry.attributes)) {
    if (!(KIT_ATTRIBUTES as readonly string[]).includes(name)) geometry.deleteAttribute(name);
  }
  geometry.deleteAttribute('normal');
  geometry.computeVertexNormals();
  paintGeometry(geometry, color);
  return applyPlacement(geometry, placement);
}

/** Builds a convex solid from planar polygons; each is fan-triangulated and wound to face away from the solid's center. */
function convexSolid(faces: readonly (readonly Vec3[])[], color: KitColor, placement?: Placement): THREE.BufferGeometry {
  const center = new THREE.Vector3();
  let vertexCount = 0;
  for (const face of faces) {
    for (const vertex of face) {
      center.add(new THREE.Vector3(...vertex));
      vertexCount += 1;
    }
  }
  center.divideScalar(vertexCount);
  const positions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (const face of faces) {
    for (let index = 1; index < face.length - 1; index += 1) {
      a.set(...face[0]);
      b.set(...face[index]);
      c.set(...face[index + 1]);
      normal.crossVectors(b.clone().sub(a), c.clone().sub(a));
      const outward = normal.dot(a.clone().sub(center)) >= 0;
      const triangle = outward ? [a, b, c] : [a, c, b];
      for (const vertex of triangle) positions.push(vertex.x, vertex.y, vertex.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return finish(geometry, color, placement);
}

export function box(width: number, height: number, depth: number, color: KitColor, placement?: Placement): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2, 0);
  return finish(geometry, color, placement);
}

/** A flat quad facing +Z (2 triangles), standing on y = 0: windows and doors painted onto a wall. */
export function plate(width: number, height: number, color: KitColor, placement?: Placement): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate(0, height / 2, 0);
  return finish(geometry, color, placement);
}

/**
 * A box whose top edges are chamfered by `bevel` (20 triangles): the cheap rounded look of the toy buildings. The walls are
 * vertical up to `height - bevel`, then slope in to a smaller top face.
 */
export function bevelBox(
  width: number,
  height: number,
  depth: number,
  bevel: number,
  color: KitColor,
  placement?: Placement,
): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const wallTop = height - bevel;
  const tw = hw - bevel;
  const td = hd - bevel;
  const bottom: Vec3[] = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]];
  const shoulder: Vec3[] = [[-hw, wallTop, -hd], [hw, wallTop, -hd], [hw, wallTop, hd], [-hw, wallTop, hd]];
  const top: Vec3[] = [[-tw, height, -td], [tw, height, -td], [tw, height, td], [-tw, height, td]];
  const faces: Vec3[][] = [bottom, top];
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;
    faces.push([bottom[index], bottom[next], shoulder[next], shoulder[index]]);
    faces.push([shoulder[index], shoulder[next], top[next], top[index]]);
  }
  return convexSolid(faces, color, placement);
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  color: KitColor,
  placement?: Placement,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1);
  geometry.translate(0, height / 2, 0);
  return finish(geometry, color, placement);
}

export function cone(radius: number, height: number, segments: number, color: KitColor, placement?: Placement): THREE.BufferGeometry {
  return cylinder(0, radius, height, segments, color, placement);
}

/** A solid of revolution: `profile` is a list of `[radius, y]` points from the bottom up. */
export function lathe(profile: readonly Vec2[], segments: number, color: KitColor, placement?: Placement): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments);
  return finish(geometry, color, placement);
}

/** A triangular prism roof: the ridge runs along X, the slopes face +Z and -Z, and the base is `width` by `depth`. */
export function gableRoof(width: number, depth: number, height: number, color: KitColor, placement?: Placement): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const faces: Vec3[][] = [
    [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]],
    [[-hw, 0, -hd], [hw, 0, -hd], [hw, height, 0], [-hw, height, 0]],
    [[-hw, 0, hd], [hw, 0, hd], [hw, height, 0], [-hw, height, 0]],
    [[-hw, 0, -hd], [-hw, 0, hd], [-hw, height, 0]],
    [[hw, 0, -hd], [hw, 0, hd], [hw, height, 0]],
  ];
  return convexSolid(faces, color, placement);
}

/**
 * Extrudes a polygon drawn in the XY plane (Y up) by `depth` along Z, centered on Z. The polygon may be concave and may carry holes
 * given as extra loops.
 */
export function extrude(
  outline: readonly Vec2[],
  depth: number,
  color: KitColor,
  placement?: Placement,
  holes: readonly (readonly Vec2[])[] = [],
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 6 });
  geometry.translate(0, 0, -depth / 2);
  return finish(geometry, color, placement);
}

/**
 * A long roof with curved, upturned eaves (a pagoda or covered-bridge roof): the ridge runs along X for `length`, the
 * slopes face +Z and -Z, the eave tips lift by `upturn` above the eave line, and the sheet is `thickness` thick.
 */
export function curvedEaveRoof(
  length: number,
  depth: number,
  height: number,
  upturn: number,
  color: KitColor,
  placement?: Placement,
  thickness = 0.03,
): THREE.BufferGeometry {
  const hd = depth / 2;
  const top: Vec2[] = [
    [-hd, upturn], [-hd * 0.78, 0], [-hd * 0.4, height * 0.45], [0, height],
    [hd * 0.4, height * 0.45], [hd * 0.78, 0], [hd, upturn],
  ];
  const underside: Vec2[] = [[hd * 0.9, -thickness], [-hd * 0.9, -thickness]];
  // Profile in the (Z, Y) plane, extruded along the ridge: drawn as XY, then turned so its extrusion axis is X.
  const roof = extrude([...top, ...underside], length, color, { rotation: [0, Math.PI / 2, 0] });
  return applyPlacement(roof, placement ?? {});
}

/** Points of a half circle (a semicircular arch opening) from the left foot to the right foot, `steps` segments. */
export function archPoints(centerX: number, baseY: number, radius: number, steps: number): Vec2[] {
  return Array.from({ length: steps + 1 }, (_, index): Vec2 => {
    const angle = Math.PI - (index / steps) * Math.PI;
    return [centerX + Math.cos(angle) * radius, baseY + Math.sin(angle) * radius];
  });
}

/** A wall `width` x `height` x `depth` with one round-topped opening, so a bridge or gate reads as an arch. */
export function archWall(
  width: number,
  height: number,
  depth: number,
  openingWidth: number,
  openingHeight: number,
  color: KitColor,
  placement?: Placement,
  steps = 6,
): THREE.BufferGeometry {
  const hw = width / 2;
  const radius = openingWidth / 2;
  const springY = Math.max(0, openingHeight - radius);
  // Counter-clockwise: along the base to the opening, up the left jamb, over the arch, down the right jamb, then round the wall.
  const outline: Vec2[] = [
    [-hw, 0], [-radius, 0], ...archPoints(0, springY, radius, steps), [radius, 0], [hw, 0], [hw, height], [-hw, height],
  ];
  return extrude(outline, depth, color, placement);
}

/** A round tube following the points (Catmull-Rom), for rails, cables and bridge decks. */
export function tubeAlong(
  points: readonly Vec3[],
  radius: number,
  color: KitColor,
  options: { tubularSegments?: number; radialSegments?: number } = {},
  placement?: Placement,
): THREE.BufferGeometry {
  const { tubularSegments = 12, radialSegments = 4 } = options;
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  return finish(geometry, color, placement);
}

export function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  const count = index ? index.count : geometry.getAttribute('position').count;
  return Math.floor(count / 3);
}

/** Merges kit parts into one geometry (one draw call) and releases the parts. */
export function mergeKit(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) throw new Error('mergeKit needs at least one part.');
  const merged = mergeGeometries([...parts], false);
  for (const part of parts) part.dispose();
  // mergeGeometries returns null when attribute layouts differ; every kit part has the same three attributes.
  if (!merged) throw new Error('Kit parts do not share one attribute layout.');
  return merged;
}

/** Bounding box of a geometry as `{ min, max, size }`, for footprint and height budgets. */
export function measureGeometry(geometry: THREE.BufferGeometry): { min: Vec3; max: Vec3; size: Vec3 } {
  geometry.computeBoundingBox();
  const box3 = geometry.boundingBox ?? new THREE.Box3();
  return {
    min: [box3.min.x, box3.min.y, box3.min.z],
    max: [box3.max.x, box3.max.y, box3.max.z],
    size: [box3.max.x - box3.min.x, box3.max.y - box3.min.y, box3.max.z - box3.min.z],
  };
}
