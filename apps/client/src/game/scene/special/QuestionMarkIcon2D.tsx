import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

interface QuestionMarkIcon2DProps {
  panel: TilePanelLayout;
}

function createQuestionMarkHookShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.38, 0.06);
  shape.quadraticCurveTo(-0.36, 0.48, 0, 0.58);
  shape.quadraticCurveTo(0.36, 0.48, 0.36, 0.15);
  shape.quadraticCurveTo(0.36, -0.1, 0.08, -0.23);
  shape.lineTo(0.02, -0.25);
  shape.lineTo(0.02, -0.02);
  shape.quadraticCurveTo(0.15, 0.05, 0.15, 0.18);
  shape.quadraticCurveTo(0.15, 0.34, 0, 0.38);
  shape.quadraticCurveTo(-0.15, 0.34, -0.15, 0.17);
  shape.lineTo(-0.15, 0.06);
  shape.closePath();
  return shape;
}

function createQuestionMarkStemShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.08, -0.2);
  shape.quadraticCurveTo(0, -0.24, 0.08, -0.2);
  shape.lineTo(0.08, -0.47);
  shape.quadraticCurveTo(0, -0.51, -0.08, -0.47);
  shape.closePath();
  return shape;
}

function createQuestionMarkDotShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, -0.65, 0.085, 0, Math.PI * 2, false);
  return shape;
}

export function createQuestionMarkGeometry(): {
  hook: THREE.ShapeGeometry;
  stem: THREE.ShapeGeometry;
  dot: THREE.ShapeGeometry;
} {
  return {
    hook: new THREE.ShapeGeometry(createQuestionMarkHookShape()),
    stem: new THREE.ShapeGeometry(createQuestionMarkStemShape()),
    dot: new THREE.ShapeGeometry(createQuestionMarkDotShape()),
  };
}

export default function QuestionMarkIcon2D({ panel }: QuestionMarkIcon2DProps) {
  const isCorner = panel.side === 'CORNER';
  const width = panel.upperSize[0] * (isCorner ? 0.56 : 0.74);
  const height = Math.min(panel.upperSize[1] * (isCorner ? 0.64 : 0.76), width * 1.42);
  const geometries = useMemo(() => createQuestionMarkGeometry(), []);

  useEffect(() => () => {
    geometries.hook.dispose();
    geometries.stem.dispose();
    geometries.dot.dispose();
  }, [geometries]);

  return (
    <group
      name="QuestionMarkIcon2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panel.upperCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{ icon: 'procedural-question-mark', color: boardVisualTokens.chanceQuestion }}
    >
      <mesh
        name="QuestionMarkHook"
        geometry={geometries.hook}
        scale={[width, height, 1]}
        position={[0, 0.018, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color={boardVisualTokens.chanceQuestion}
          roughness={0.46}
          metalness={0}
        />
      </mesh>
      <mesh
        name="QuestionMarkStem"
        geometry={geometries.stem}
        scale={[width, height, 1]}
        position={[0, 0.019, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color={boardVisualTokens.chanceQuestion}
          roughness={0.46}
          metalness={0}
        />
      </mesh>
      <mesh
        name="QuestionMarkDot"
        geometry={geometries.dot}
        scale={[width, height, 1]}
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color={boardVisualTokens.chanceQuestion}
          roughness={0.46}
          metalness={0}
        />
      </mesh>
    </group>
  );
}
