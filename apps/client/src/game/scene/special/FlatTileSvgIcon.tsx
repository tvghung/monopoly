import { useMemo } from 'react';
import * as THREE from 'three';
import { SVGLoader, type SVGResult } from 'three/addons/loaders/SVGLoader.js';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import railroadTrainUrl from './icons/railroad-train.svg?url';
import handcuffsUrl from './icons/handcuffs.svg?url';
import waterFaucetUrl from './icons/water-faucet.svg?url';
import electricBulbUrl from './icons/electric-bulb.svg?url';
import railroadTrainSvg from './icons/railroad-train.svg?raw';
import handcuffsSvg from './icons/handcuffs.svg?raw';
import waterFaucetSvg from './icons/water-faucet.svg?raw';
import electricBulbSvg from './icons/electric-bulb.svg?raw';

export type FlatTileSvgIconKind =
  | 'train-convoy-2d'
  | 'handcuffs-2d'
  | 'water-faucet-2d'
  | 'electric-bulb-2d';

export interface FlatTileSvgIconSpec {
  kind: FlatTileSvgIconKind;
  url: string;
  source: string;
  aspectRatio: number;
  safeWidthRatio: number;
  safeHeightRatio: number;
  cornerSafeHeightRatio?: number;
}

export const FLAT_SVG_RENDERING_PIPELINE = 'svg-loader-shape-geometry' as const;

const SVG_VIEW_BOX_WIDTH = 256;
const SVG_VIEW_BOX_HEIGHT = 224;
const SVG_VIEW_BOX_ASPECT_RATIO = SVG_VIEW_BOX_WIDTH / SVG_VIEW_BOX_HEIGHT;
const SVG_LOADER = new SVGLoader();

export const FLAT_TILE_SVG_ICONS: Record<FlatTileSvgIconKind, FlatTileSvgIconSpec> = {
  'train-convoy-2d': {
    kind: 'train-convoy-2d',
    url: railroadTrainUrl,
    source: railroadTrainSvg,
    aspectRatio: SVG_VIEW_BOX_ASPECT_RATIO,
    safeWidthRatio: 0.86,
    safeHeightRatio: 0.66,
  },
  'handcuffs-2d': {
    kind: 'handcuffs-2d',
    url: handcuffsUrl,
    source: handcuffsSvg,
    aspectRatio: SVG_VIEW_BOX_ASPECT_RATIO,
    safeWidthRatio: 0.86,
    safeHeightRatio: 0.66,
    cornerSafeHeightRatio: 0.78,
  },
  'water-faucet-2d': {
    kind: 'water-faucet-2d',
    url: waterFaucetUrl,
    source: waterFaucetSvg,
    aspectRatio: SVG_VIEW_BOX_ASPECT_RATIO,
    safeWidthRatio: 0.86,
    safeHeightRatio: 0.66,
  },
  'electric-bulb-2d': {
    kind: 'electric-bulb-2d',
    url: electricBulbUrl,
    source: electricBulbSvg,
    aspectRatio: SVG_VIEW_BOX_ASPECT_RATIO,
    safeWidthRatio: 0.84,
    safeHeightRatio: 0.66,
  },
};

export function getFlatTileSvgArtSize(
  panel: TilePanelLayout,
  icon: FlatTileSvgIconSpec,
): readonly [number, number] {
  const isCorner = panel.side === 'CORNER';
  const availableSize = isCorner ? panel.surfaceSize : panel.upperSize;
  const targetWidth = availableSize[0] * icon.safeWidthRatio;
  const targetHeight = availableSize[1]
    * (isCorner ? icon.cornerSafeHeightRatio ?? icon.safeHeightRatio : icon.safeHeightRatio);
  const height = Math.min(targetHeight, targetWidth / icon.aspectRatio);
  return [height * icon.aspectRatio, height];
}

interface FlatTileSvgIconProps {
  panel: TilePanelLayout;
  icon: FlatTileSvgIconSpec;
  name: string;
}

export function createFlatSvgGeometry(svg: SVGResult): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];

  svg.paths.forEach(path => {
    const style = path.userData.style as {
      fill?: string;
    } | undefined;
    if (style?.fill === 'none') return;

    path.toShapes().forEach(shape => {
      const sourceGeometry = new THREE.ShapeGeometry(shape);
      const sourcePositions = sourceGeometry.getAttribute('position');
      for (let index = 0; index < sourcePositions.count; index += 1) {
        positions.push(
          sourcePositions.getX(index),
          sourcePositions.getY(index),
          sourcePositions.getZ(index),
        );
        colors.push(path.color.r, path.color.g, path.color.b);
      }
      sourceGeometry.dispose();
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

export default function FlatTileSvgIcon({ panel, icon, name }: FlatTileSvgIconProps) {
  const svg = useMemo(() => SVG_LOADER.parse(icon.source), [icon.source]);
  const geometry = useMemo(() => createFlatSvgGeometry(svg), [svg]);
  const [width] = getFlatTileSvgArtSize(panel, icon);
  const isCorner = panel.side === 'CORNER';
  const svgScale = width / SVG_VIEW_BOX_WIDTH;

  return (
    <group
      name={name}
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.01, isCorner ? 0 : panel.upperArtCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{
        artKind: icon.kind,
        pipeline: 'local-flat-svg',
        geometryPipeline: FLAT_SVG_RENDERING_PIPELINE,
        panelRegion: isCorner ? 'corner' : 'upper',
        meshCount: 1,
      }}
    >
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group
          position={[-SVG_VIEW_BOX_WIDTH * svgScale / 2, SVG_VIEW_BOX_HEIGHT * svgScale / 2, 0]}
          scale={[svgScale, -svgScale, svgScale]}
        >
          <mesh name={`${name}:FlatGeometry`} geometry={geometry} renderOrder={6}>
            <meshBasicMaterial
              vertexColors
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
