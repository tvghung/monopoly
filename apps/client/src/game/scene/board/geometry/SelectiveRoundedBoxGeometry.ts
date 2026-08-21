import { BufferGeometry, Float32BufferAttribute } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CORNER_SURFACE_EPSILON = 0.0002;
const CORNER_SIGNS: readonly (readonly [number, number, number])[] = [
  [-1, -1, -1],
  [-1, -1, 1],
  [-1, 1, -1],
  [-1, 1, 1],
  [1, -1, -1],
  [1, -1, 1],
  [1, 1, -1],
  [1, 1, 1],
];

function createCornerPatch(
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments: number,
  signs: readonly [number, number, number],
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const halfExtents = [width / 2 - radius, height / 2 - radius, depth / 2 - radius];
  const isReversed = signs[0] * signs[1] * signs[2] < 0;

  const point = (row: number, column: number): readonly [number[], number[], number[]] => {
    const theta = (row / segments) * Math.PI / 2;
    const phi = (column / segments) * Math.PI / 2;
    const localNormal = [
      Math.sin(theta) * Math.cos(phi),
      Math.sin(theta) * Math.sin(phi),
      Math.cos(theta),
    ];
    const normal = localNormal.map((component, index) => component * signs[index]);
    const position = halfExtents.map((extent, index) => (
      signs[index] * extent + normal[index] * (radius + CORNER_SURFACE_EPSILON)
    ));
    return [position, normal, [column / segments, row / segments]];
  };

  const appendTriangle = (
    first: readonly [number[], number[], number[]],
    second: readonly [number[], number[], number[]],
    third: readonly [number[], number[], number[]],
  ) => {
    [first, second, third].forEach(([position, normal, uv]) => {
      positions.push(...position);
      normals.push(...normal);
      uvs.push(...uv);
    });
  };

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const topLeft = point(row, column);
      const bottomLeft = point(row + 1, column);
      const bottomRight = point(row + 1, column + 1);
      const topRight = point(row, column + 1);
      if (isReversed) {
        appendTriangle(topLeft, bottomRight, bottomLeft);
        if (row > 0) appendTriangle(topLeft, topRight, bottomRight);
      } else {
        appendTriangle(topLeft, bottomLeft, bottomRight);
        if (row > 0) appendTriangle(topLeft, bottomRight, topRight);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * Keeps the existing rounded-box edge density and adds finer geometry only
 * over the eight spherical corner octants.
 */
export class SelectiveRoundedBoxGeometry extends BufferGeometry {
  readonly edgeSegments: number;
  readonly cornerSegments: number;
  readonly radius: number;

  constructor(
    width = 1,
    height = 1,
    depth = 1,
    edgeSegments = 2,
    cornerSegments = edgeSegments,
    radius = 0.1,
  ) {
    super();

    const clampedRadius = Math.min(width / 2, height / 2, depth / 2, radius);
    const parts: BufferGeometry[] = [
      new RoundedBoxGeometry(width, height, depth, edgeSegments, clampedRadius),
    ];
    if (cornerSegments > edgeSegments && clampedRadius > 0) {
      CORNER_SIGNS.forEach(signs => {
        parts.push(createCornerPatch(
          width,
          height,
          depth,
          clampedRadius,
          cornerSegments,
          signs,
        ));
      });
    }

    const merged = mergeGeometries(parts, false);
    parts.forEach(part => part.dispose());
    if (!merged) {
      throw new Error('Unable to merge selective rounded-box geometry');
    }

    this.copy(merged);
    merged.dispose();
    this.edgeSegments = edgeSegments;
    this.cornerSegments = cornerSegments;
    this.radius = clampedRadius;
    this.computeBoundingSphere();
  }
}
