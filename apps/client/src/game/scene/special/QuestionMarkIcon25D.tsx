import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

interface QuestionMarkIcon25DProps {
  panel: TilePanelLayout;
}

export interface QuestionMarkGeometry {
  main: THREE.ExtrudeGeometry;
  dot: THREE.ExtrudeGeometry;
}

export const QUESTION_MARK_EXTRUSION_DEPTH = 0.065;

function createQuestionMarkMainShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.43, -0.12);
  shape.quadraticCurveTo(-0.5, 0.1, -0.45, 0.38);
  shape.quadraticCurveTo(-0.38, 0.72, 0, 0.83);
  shape.quadraticCurveTo(0.4, 0.78, 0.47, 0.42);
  shape.quadraticCurveTo(0.52, 0.08, 0.25, -0.17);
  shape.quadraticCurveTo(0.15, -0.27, 0.14, -0.38);
  shape.lineTo(0.14, -0.49);
  shape.lineTo(-0.14, -0.49);
  shape.lineTo(-0.14, -0.31);
  shape.quadraticCurveTo(-0.14, -0.11, 0.07, 0.06);
  shape.quadraticCurveTo(0.21, 0.17, 0.2, 0.35);
  shape.quadraticCurveTo(0.19, 0.52, 0, 0.56);
  shape.quadraticCurveTo(-0.2, 0.52, -0.2, 0.31);
  shape.lineTo(-0.2, 0.11);
  shape.lineTo(-0.43, 0.11);
  shape.closePath();
  return shape;
}

function createQuestionMarkDotShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, -0.72, 0.095, 0, Math.PI * 2, false);
  return shape;
}

function extrude(shape: THREE.Shape): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth: QUESTION_MARK_EXTRUSION_DEPTH,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.014,
    bevelThickness: 0.012,
    curveSegments: 8,
  });
}

export function createQuestionMarkGeometry(): QuestionMarkGeometry {
  return {
    main: extrude(createQuestionMarkMainShape()),
    dot: extrude(createQuestionMarkDotShape()),
  };
}

function createMaterials(): THREE.MeshStandardMaterial[] {
  return [
    new THREE.MeshStandardMaterial({
      color: boardVisualTokens.chanceQuestion,
      roughness: 0.46,
      metalness: 0,
    }),
    new THREE.MeshStandardMaterial({
      color: boardVisualTokens.chanceQuestionSide,
      roughness: 0.54,
      metalness: 0,
    }),
  ];
}

export default function QuestionMarkIcon25D({ panel }: QuestionMarkIcon25DProps) {
  const isCorner = panel.side === 'CORNER';
  const width = panel.upperSize[0] * (isCorner ? 0.56 : 0.7);
  const height = Math.min(panel.upperSize[1] * (isCorner ? 0.68 : 0.46), width * 1.4);
  const geometries = useMemo(() => createQuestionMarkGeometry(), []);
  const materials = useMemo(() => createMaterials(), []);

  useEffect(() => () => {
    geometries.main.dispose();
    geometries.dot.dispose();
    materials.forEach(material => material.dispose());
  }, [geometries, materials]);

  return (
    <group
      name="QuestionMarkIcon25D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panel.upperArtCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{ icon: 'procedural-question-mark', continuousBody: true, extrusionDepth: QUESTION_MARK_EXTRUSION_DEPTH }}
    >
      <mesh
        name="QuestionMarkBody"
        geometry={geometries.main}
        material={materials}
        scale={[width, height, 1]}
        position={[0, 0.022, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <mesh
        name="QuestionMarkDot"
        geometry={geometries.dot}
        material={materials}
        scale={[width, height, 1]}
        position={[0, 0.024, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
    </group>
  );
}
