import * as THREE from 'three';

function appendTriangle(
  positions: number[],
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  third: readonly [number, number, number],
): void {
  positions.push(...first, ...second, ...third);
}

/** Creates one flat-shaded gable roof with its origin at the wall-top plane. */
export function createPitchedRoofGeometry(
  width: number,
  depth: number,
  rise: number,
): THREE.BufferGeometry {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const frontLeft: readonly [number, number, number] = [-halfWidth, 0, -halfDepth];
  const frontRight: readonly [number, number, number] = [halfWidth, 0, -halfDepth];
  const backRight: readonly [number, number, number] = [halfWidth, 0, halfDepth];
  const backLeft: readonly [number, number, number] = [-halfWidth, 0, halfDepth];
  const frontRidge: readonly [number, number, number] = [0, rise, -halfDepth];
  const backRidge: readonly [number, number, number] = [0, rise, halfDepth];
  const positions: number[] = [];

  appendTriangle(positions, frontLeft, backLeft, backRidge);
  appendTriangle(positions, frontLeft, backRidge, frontRidge);
  appendTriangle(positions, frontRight, frontRidge, backRidge);
  appendTriangle(positions, frontRight, backRidge, backRight);
  appendTriangle(positions, frontLeft, frontRidge, frontRight);
  appendTriangle(positions, backLeft, backRight, backRidge);
  appendTriangle(positions, frontLeft, frontRight, backRight);
  appendTriangle(positions, frontLeft, backRight, backLeft);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
