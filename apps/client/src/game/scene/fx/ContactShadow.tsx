import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { CONTACT_SHADOW_Y } from '../board/architecture/boardArtSpec';

const TEXTURE_SIZE = 32;
const textureData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
for (let y = 0; y < TEXTURE_SIZE; y += 1) {
  for (let x = 0; x < TEXTURE_SIZE; x += 1) {
    const dx = (x + 0.5) / TEXTURE_SIZE * 2 - 1;
    const dy = (y + 0.5) / TEXTURE_SIZE * 2 - 1;
    const distance = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const alpha = Math.round((1 - distance) ** 1.8 * 190);
    const index = (y * TEXTURE_SIZE + x) * 4;
    textureData[index] = 25;
    textureData[index + 1] = 48;
    textureData[index + 2] = 55;
    textureData[index + 3] = alpha;
  }
}

export const CONTACT_SHADOW_TEXTURE = new THREE.DataTexture(
  textureData,
  TEXTURE_SIZE,
  TEXTURE_SIZE,
  THREE.RGBAFormat,
);
CONTACT_SHADOW_TEXTURE.needsUpdate = true;
export const CONTACT_SHADOW_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const CONTACT_SHADOW_MATERIAL = new THREE.MeshBasicMaterial({
  map: CONTACT_SHADOW_TEXTURE,
  transparent: true,
  depthWrite: false,
  toneMapped: false,
});
const CONTACT_SHADOW_MATERIALS = new Map<number, THREE.MeshBasicMaterial>();

function getContactShadowMaterial(opacity: number): THREE.MeshBasicMaterial {
  const key = Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, Math.round(opacity * 100) / 100))
    : 0.22;
  const cached = CONTACT_SHADOW_MATERIALS.get(key);
  if (cached) return cached;
  const material = CONTACT_SHADOW_MATERIAL.clone();
  material.opacity = key;
  CONTACT_SHADOW_MATERIALS.set(key, material);
  return material;
}

interface ContactShadowProps {
  scale?: readonly [number, number];
  opacity?: number;
  position?: readonly [number, number, number];
  materialRef?: MutableRefObject<THREE.MeshBasicMaterial | null>;
  uniqueMaterial?: boolean;
}

export default function ContactShadow({
  scale = [0.7, 0.42],
  opacity = 0.22,
  position = [0, CONTACT_SHADOW_Y, 0],
  materialRef,
  uniqueMaterial = false,
}: ContactShadowProps) {
  const material = useMemo(() => {
    const baseMaterial = getContactShadowMaterial(opacity);
    return uniqueMaterial ? baseMaterial.clone() : baseMaterial;
  }, [opacity, uniqueMaterial]);

  useEffect(() => {
    if (!materialRef) return undefined;
    materialRef.current = material;
    return () => {
      if (materialRef.current === material) materialRef.current = null;
    };
  }, [material, materialRef]);

  useEffect(() => () => {
    if (uniqueMaterial) material.dispose();
  }, [material, uniqueMaterial]);

  return (
    <mesh
      geometry={CONTACT_SHADOW_GEOMETRY}
      material={material}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[scale[0], scale[1], 1]}
      renderOrder={-1}
      userData={{ contactShadowOpacity: opacity }}
      dispose={null}
    />
  );
}
