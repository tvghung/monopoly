import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  STATION_TRAY_DEPTH,
  STATION_TRAY_HEIGHT,
  STATION_TRAY_RIM_HEIGHT,
  STATION_TRAY_RIM_WIDTH,
  STATION_TRAY_WIDTH,
} from './stationWorld';

const BODY_RADIUS = 0.05;
const RIM_OUTER_RADIUS = 0.1;

/** Dark lacquer body of a tray, resting on y = 0. */
export function createTrayBodyGeometry(): THREE.BufferGeometry {
  const geometry = new RoundedBoxGeometry(STATION_TRAY_WIDTH, STATION_TRAY_HEIGHT, STATION_TRAY_DEPTH, 2, BODY_RADIUS);
  geometry.translate(0, STATION_TRAY_HEIGHT / 2, 0);
  return geometry;
}

function roundedRectPath(path: THREE.Path, width: number, depth: number, radius: number): void {
  const x = width / 2;
  const y = depth / 2;
  path.moveTo(-x + radius, -y);
  path.lineTo(x - radius, -y);
  path.quadraticCurveTo(x, -y, x, -y + radius);
  path.lineTo(x, y - radius);
  path.quadraticCurveTo(x, y, x - radius, y);
  path.lineTo(-x + radius, y);
  path.quadraticCurveTo(-x, y, -x, y - radius);
  path.lineTo(-x, -y + radius);
  path.quadraticCurveTo(-x, -y, -x + radius, -y);
}

/** Hollow frame that sits on top of the body; tinted per instance with the player color. */
export function createTrayRimGeometry(): THREE.BufferGeometry {
  const outer = new THREE.Shape();
  roundedRectPath(outer, STATION_TRAY_WIDTH, STATION_TRAY_DEPTH, RIM_OUTER_RADIUS);
  const hole = new THREE.Path();
  roundedRectPath(
    hole,
    STATION_TRAY_WIDTH - STATION_TRAY_RIM_WIDTH * 2,
    STATION_TRAY_DEPTH - STATION_TRAY_RIM_WIDTH * 2,
    Math.max(0.02, RIM_OUTER_RADIUS - STATION_TRAY_RIM_WIDTH / 2),
  );
  outer.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(outer, {
    depth: STATION_TRAY_RIM_HEIGHT,
    bevelEnabled: false,
    curveSegments: 6,
  });
  // Shape XY becomes the ground plane and the extrusion (+Z) becomes up (+Y).
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, STATION_TRAY_HEIGHT, 0);
  return geometry;
}
