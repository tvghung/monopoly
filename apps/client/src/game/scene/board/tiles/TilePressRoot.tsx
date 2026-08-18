import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useTileMotionController } from '../motion/TileMotionProvider';

interface TilePressRootProps {
  tileId: number;
  children: ReactNode;
}

export default function TilePressRoot({ tileId, children }: TilePressRootProps) {
  const groupRef = useRef<THREE.Group>(null);
  const controller = useTileMotionController();

  useEffect(() => {
    const group = groupRef.current;
    if (!group || !controller) return undefined;
    return controller.register(tileId, group);
  }, [controller, tileId]);

  return (
    <group ref={groupRef} name={`TilePressRoot:${tileId}`}>
      {children}
    </group>
  );
}
