import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { applyCoinEnvironmentMap } from './coinVisuals';

export default function CoinMaterialEnvironment() {
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);

  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const environment = new RoomEnvironment();
    const renderTarget = pmremGenerator.fromScene(environment);
    applyCoinEnvironmentMap(renderTarget.texture);
    invalidate();

    return () => {
      applyCoinEnvironmentMap(null);
      renderTarget.dispose();
      environment.dispose();
      environment.clear();
      pmremGenerator.dispose();
      invalidate();
    };
  }, [gl, invalidate]);

  return null;
}
