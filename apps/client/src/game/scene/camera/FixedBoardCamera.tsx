import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  DEFAULT_CAMERA_FOV,
  getCameraPosition,
} from './cameraMath';

function configurePerspectiveCamera(
  camera: THREE.PerspectiveCamera,
  aspect: number,
): void {
  camera.fov = DEFAULT_CAMERA_FOV;
  camera.aspect = aspect;
  camera.position.set(...getCameraPosition(aspect));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

export default function FixedBoardCamera() {
  const camera = useThree(state => state.camera);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const invalidate = useThree(state => state.invalidate);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = width > 0 && height > 0 ? width / height : 1;
    configurePerspectiveCamera(camera, aspect);
    invalidate();
  }, [camera, height, invalidate, width]);

  return null;
}
