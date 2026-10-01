import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  archPoints,
  archWall,
  bevelBox,
  box,
  cone,
  cylinder,
  extrude,
  gableRoof,
  lathe,
  measureGeometry,
  mergeKit,
  paintGeometry,
  triangleCount,
  tubeAlong,
} from './lowPolyKit';

function attributeNames(geometry: THREE.BufferGeometry): string[] {
  return Object.keys(geometry.attributes).sort();
}

function positions(geometry: THREE.BufferGeometry): number[] {
  return Array.from(geometry.getAttribute('position').array);
}

/** Every triangle must face away from the middle of the part (the solids of the kit are convex). */
function facesOutward(geometry: THREE.BufferGeometry): boolean {
  const position = geometry.getAttribute('position');
  const { min, max } = measureGeometry(geometry);
  const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    normal.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const centroid = a.clone().add(b).add(c).divideScalar(3);
    if (normal.dot(centroid.sub(center)) <= 0) return false;
  }
  return true;
}

describe('low-poly kit primitives', () => {
  const builders: Array<[string, () => THREE.BufferGeometry]> = [
    ['box', () => box(1, 2, 3, '#ff8800')],
    ['bevelBox', () => bevelBox(1, 2, 3, 0.1, '#ff8800')],
    ['cylinder', () => cylinder(0.4, 0.5, 1, 8, '#ff8800')],
    ['cone', () => cone(0.5, 1, 8, '#ff8800')],
    ['lathe', () => lathe([[0.5, 0], [0.4, 0.5], [0.1, 1]], 8, '#ff8800')],
    ['gableRoof', () => gableRoof(1, 1, 0.4, '#ff8800')],
    ['extrude', () => extrude([[0, 0], [1, 0], [1, 1], [0, 1]], 0.5, '#ff8800')],
    ['archWall', () => archWall(2, 1, 0.4, 0.8, 0.7, '#ff8800')],
    ['tubeAlong', () => tubeAlong([[0, 0, 0], [1, 0.5, 0], [2, 0, 0]], 0.05, '#ff8800')],
  ];

  it.each(builders)('%s is a faceted part with exactly position, normal and color', (_name, build) => {
    const geometry = build();
    expect(attributeNames(geometry)).toEqual(['color', 'normal', 'position']);
    expect(geometry.getIndex()).toBeNull();
    expect(triangleCount(geometry)).toBeGreaterThan(0);
    expect(geometry.getAttribute('position').count % 3).toBe(0);
  });

  it.each(builders)('%s is deterministic', (_name, build) => {
    expect(positions(build())).toEqual(positions(build()));
  });

  it('has the triangle counts the budgets rely on', () => {
    expect(triangleCount(box(1, 1, 1, '#fff'))).toBe(12);
    expect(triangleCount(bevelBox(1, 1, 1, 0.1, '#fff'))).toBe(20);
    expect(triangleCount(gableRoof(1, 1, 0.3, '#fff'))).toBe(8);
  });

  it('stands on y = 0 and is centered on x and z', () => {
    const { min, max } = measureGeometry(box(2, 3, 4, '#fff'));
    expect(min).toEqual([-1, 0, -2]);
    expect(max).toEqual([1, 3, 2]);
    const roof = measureGeometry(gableRoof(2, 1, 0.5, '#fff'));
    expect(roof.min[1]).toBe(0);
    expect(roof.max[1]).toBeCloseTo(0.5);
  });

  it('applies a placement after building the part', () => {
    const { min, max } = measureGeometry(box(1, 1, 1, '#fff', { position: [2, 3, 4] }));
    expect(min).toEqual([1.5, 3, 3.5]);
    expect(max).toEqual([2.5, 4, 4.5]);
    const rotated = measureGeometry(box(2, 1, 1, '#fff', { rotation: [0, Math.PI / 2, 0] }));
    expect(rotated.size[0]).toBeCloseTo(1);
    expect(rotated.size[2]).toBeCloseTo(2);
  });

  it('has flat face normals, so every triangle is a single shade', () => {
    const normal = bevelBox(1, 1, 1, 0.1, '#fff').getAttribute('normal');
    for (let index = 0; index < normal.count; index += 3) {
      for (let corner = 1; corner < 3; corner += 1) {
        expect(normal.getX(index + corner)).toBeCloseTo(normal.getX(index));
        expect(normal.getY(index + corner)).toBeCloseTo(normal.getY(index));
        expect(normal.getZ(index + corner)).toBeCloseTo(normal.getZ(index));
      }
    }
  });

  it('winds the convex solids so every face points away from the part', () => {
    expect(facesOutward(bevelBox(1, 2, 1, 0.1, '#fff'))).toBe(true);
    expect(facesOutward(gableRoof(1, 1, 0.4, '#fff'))).toBe(true);
  });

  it('writes the color of every vertex in linear space', () => {
    const geometry = paintGeometry(box(1, 1, 1, '#ffffff'), '#ff0000');
    const color = geometry.getAttribute('color');
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]);
    const grey = new THREE.Color('#808080');
    const painted = box(1, 1, 1, '#808080').getAttribute('color');
    expect(painted.getX(5)).toBeCloseTo(grey.r);
    expect(painted.count).toBe(36);
  });

  it('extrudes a polygon along z, centered', () => {
    const { min, max } = measureGeometry(extrude([[0, 0], [1, 0], [1, 1], [0, 1]], 0.5, '#fff'));
    expect(min[2]).toBeCloseTo(-0.25);
    expect(max[2]).toBeCloseTo(0.25);
    expect(max[0]).toBeCloseTo(1);
  });

  it('cuts an arch into a wall and keeps its outer size', () => {
    const wall = archWall(2, 1, 0.4, 0.8, 0.7, '#fff');
    const { size } = measureGeometry(wall);
    expect(size[0]).toBeCloseTo(2);
    expect(size[1]).toBeCloseTo(1);
    expect(size[2]).toBeCloseTo(0.4);
    // The opening removes the middle of the front face: more triangles than a plain extruded wall of four corners.
    expect(triangleCount(wall)).toBeGreaterThan(triangleCount(extrude([[-1, 0], [1, 0], [1, 1], [-1, 1]], 0.4, '#fff')));
    // Below the springing line (0.7 - 0.4 = 0.3) the opening is a plain rectangle: no vertex lies strictly inside it.
    const position = wall.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const inside = Math.abs(x) < 0.4 - 1e-6 && y > 1e-6 && y < 0.3 - 1e-6;
      expect(inside).toBe(false);
    }
  });

  it('lists the points of an arch from the left foot to the right foot', () => {
    const points = archPoints(0, 0.3, 0.4, 4);
    expect(points).toHaveLength(5);
    expect(points[0][0]).toBeCloseTo(-0.4);
    expect(points[0][1]).toBeCloseTo(0.3);
    expect(points[4][0]).toBeCloseTo(0.4);
    expect(points[2][1]).toBeCloseTo(0.7);
  });

  it('merges parts into one geometry with the sum of their triangles', () => {
    const parts = [box(1, 1, 1, '#fff'), gableRoof(1, 1, 0.3, '#f00', { position: [0, 1, 0] })];
    const total = parts.reduce((sum, part) => sum + triangleCount(part), 0);
    const merged = mergeKit(parts);
    expect(triangleCount(merged)).toBe(total);
    expect(attributeNames(merged)).toEqual(['color', 'normal', 'position']);
    expect(() => mergeKit([])).toThrow();
  });
});
