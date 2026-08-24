import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DiceValue } from '@monopoly/shared';
import {
  CONTACT_SHADOW_GEOMETRY,
  CONTACT_SHADOW_TEXTURE,
} from '../fx/ContactShadow';
import { isValidDiceFace, getDiceAnimationVerticalOffset } from './diceOrientation';
import {
  DICE_CONTACT_SHADOW_BASE_SCALE,
  DICE_CONTACT_SHADOW_INSTANCE_COUNT,
  getDiceContactShadowPosition,
  getDiceContactShadowState,
} from './diceContactShadow';
import { useDiceAnimationProgressRef } from './diceAnimationClock';

const DICE_CONTACT_SHADOW_VERTEX_SHADER = `
  attribute float instanceShadowOpacity;
  varying vec2 vUv;
  varying float vOpacity;

  void main() {
    vUv = uv;
    vOpacity = instanceShadowOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const DICE_CONTACT_SHADOW_FRAGMENT_SHADER = `
  uniform sampler2D shadowTexture;
  varying vec2 vUv;
  varying float vOpacity;

  void main() {
    vec4 shadow = texture2D(shadowTexture, vUv);
    float alpha = shadow.a * vOpacity;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(shadow.rgb, alpha);
  }
`;

function updateDiceContactShadowInstances(
  mesh: THREE.InstancedMesh,
  opacityAttribute: THREE.InstancedBufferAttribute,
  progress: number,
  fromDice?: DiceValue,
): void {
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  ([0, 1] as const).forEach(index => {
    const fromValue = index === 0 ? fromDice?.dice1 : fromDice?.dice2;
    const hasPreviousDice = isValidDiceFace(fromValue ?? 0);
    const verticalOffset = getDiceAnimationVerticalOffset(progress, hasPreviousDice);
    const shadowState = getDiceContactShadowState(verticalOffset);
    const shadowPosition = getDiceContactShadowPosition(index);
    position.set(...shadowPosition);
    scale.set(
      DICE_CONTACT_SHADOW_BASE_SCALE[0] * shadowState.scale,
      DICE_CONTACT_SHADOW_BASE_SCALE[1] * shadowState.scale,
      1,
    );
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    opacityAttribute.setX(index, shadowState.opacity);
  });
  mesh.instanceMatrix.needsUpdate = true;
  opacityAttribute.needsUpdate = true;
}

export default function DiceContactShadowBatch({ fromDice }: { fromDice?: DiceValue }) {
  const progressRef = useDiceAnimationProgressRef();
  const geometry = useMemo(() => {
    const nextGeometry = CONTACT_SHADOW_GEOMETRY.clone();
    nextGeometry.setAttribute(
      'instanceShadowOpacity',
      new THREE.InstancedBufferAttribute(
        new Float32Array(DICE_CONTACT_SHADOW_INSTANCE_COUNT),
        1,
      ),
    );
    return nextGeometry;
  }, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { shadowTexture: { value: CONTACT_SHADOW_TEXTURE } },
    vertexShader: DICE_CONTACT_SHADOW_VERTEX_SHADER,
    fragmentShader: DICE_CONTACT_SHADOW_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  }), []);
  const mesh = useMemo(() => {
    const nextMesh = new THREE.InstancedMesh(
      geometry,
      material,
      DICE_CONTACT_SHADOW_INSTANCE_COUNT,
    );
    nextMesh.name = 'DiceContactShadowBatch';
    nextMesh.frustumCulled = false;
    nextMesh.renderOrder = -1;
    nextMesh.userData = {
      instances: DICE_CONTACT_SHADOW_INSTANCE_COUNT,
      drawCalls: 1,
      groundLocked: true,
    };
    return nextMesh;
  }, [geometry, material]);
  const meshRef = useRef(mesh);
  const opacityAttribute = geometry.getAttribute('instanceShadowOpacity') as THREE.InstancedBufferAttribute;

  useLayoutEffect(() => {
    updateDiceContactShadowInstances(meshRef.current, opacityAttribute, progressRef.current.progress, fromDice);
  }, [fromDice, opacityAttribute, progressRef]);

  useFrame(() => {
    updateDiceContactShadowInstances(meshRef.current, opacityAttribute, progressRef.current.progress, fromDice);
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return <primitive object={mesh} dispose={null} />;
}
