import { useEffect, useMemo, useRef, type Ref } from 'react';
import * as THREE from 'three';
import type { CharacterDefinition } from '../../characters/characterRegistry';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import { useRenderQuality } from '../render/RenderQualityContext';
import { registerStandeeBase } from './standeeBaseRegistry';
import {
  createStandeeDepthMaterial,
  getStandeeFaceCenterY,
  getStandeeFaceMaterialProps,
  getStandeeFaceSize,
} from './standeeMaterial';

interface CharacterStandeeProps {
  texture: THREE.Texture | null;
  definition: CharacterDefinition;
  /** The player's color id, for the base. */
  playerColor: string;
  materialRef?: Ref<THREE.MeshBasicMaterial | null>;
}

let sharedPlane: THREE.PlaneGeometry | null = null;
function getFacePlane(): THREE.PlaneGeometry {
  sharedPlane ??= new THREE.PlaneGeometry(1, 1);
  return sharedPlane;
}

/**
 * Fading a standee (bankruptcy) needs real transparency; at full opacity the card is an opaque alpha-tested silhouette, which
 * is also what lets it cast a mascot-shaped shadow. Below 1 the alpha test drops so the fade does not pop out at 0.5.
 */
export function applyStandeeOpacity(material: THREE.Material, opacity: number): void {
  const faded = opacity < 0.999;
  material.opacity = faded ? opacity : 1;
  material.transparent = faded;
  material.alphaTest = faded ? 0.04 : 0.5;
}

/**
 * The mascot as a die-cut standee (plan 05 §8.4), the visual node under the body group in place of the old sprite: a vertical
 * card facing the camera's azimuth, plus an anchor that the instanced bases follow. Hop, lean, reactions and slot reflow are
 * the body group's, unchanged.
 */
export default function CharacterStandee({ texture, definition, playerColor, materialRef }: CharacterStandeeProps) {
  const { shadows } = useRenderQuality();
  const anchorRef = useRef<THREE.Object3D>(null);
  const size = getStandeeFaceSize(definition.scale);
  const centerY = getStandeeFaceCenterY(definition.scale, definition.verticalOffset);
  const depthMaterial = useMemo(() => (texture ? createStandeeDepthMaterial(texture) : null), [texture]);
  useEffect(() => () => depthMaterial?.dispose(), [depthMaterial]);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return undefined;
    return registerStandeeBase(Symbol('standee-base'), { anchor, color: getPlayerDisplayColor(playerColor) });
  }, [playerColor]);

  return (
    <>
      <object3D ref={anchorRef} name="StandeeBaseAnchor" />
      {texture
        ? (
          <mesh
            name="StandeeFace"
            geometry={getFacePlane()}
            position={[0, centerY, 0]}
            scale={[size.width, size.height, 1]}
            castShadow={shadows.enabled}
            customDepthMaterial={depthMaterial ?? undefined}
            dispose={null}
          >
            <meshBasicMaterial ref={materialRef} {...getStandeeFaceMaterialProps(texture)} />
          </mesh>
        )
        : null}
    </>
  );
}
