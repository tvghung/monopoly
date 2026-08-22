import * as THREE from 'three';

export const COIN_RADIUS = 0.14;
export const COIN_THICKNESS = 0.06;
export const COIN_RADIAL_SEGMENTS = 14;
export const COIN_GOLD = new THREE.Color('#e6ad36');
export const COIN_DISABLED = new THREE.Color('#8d9692');

export const SHARED_COIN_GEOMETRY = new THREE.CylinderGeometry(
  COIN_RADIUS,
  COIN_RADIUS,
  COIN_THICKNESS,
  COIN_RADIAL_SEGMENTS,
);

export const SHARED_COIN_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.42,
  metalness: 0.38,
});
