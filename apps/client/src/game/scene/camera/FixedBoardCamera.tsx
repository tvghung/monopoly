import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  calculateOrthographicHalfHeight,
  getOrthographicCameraPosition,
} from './cameraMath';

function configureOrthographicCamera(
  camera: THREE.OrthographicCamera,
  aspect: number,
): void {
  const halfHeight = calculateOrthographicHalfHeight(aspect);
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.position.set(...getOrthographicCameraPosition());
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

export default function FixedBoardCamera() {
  const camera = useThree(state => state.camera);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const invalidate = useThree(state => state.invalidate);

  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const aspect = width > 0 && height > 0 ? width / height : 1;
    configureOrthographicCamera(camera, aspect);
    invalidate();
  }, [camera, height, invalidate, width]);

  return null;
}
