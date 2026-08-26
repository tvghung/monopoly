import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import {
  TILE_ICON_BACKING_Y_OFFSET,
  TILE_ICON_DEPTH,
  TILE_ICON_FACE_Y_OFFSET,
  TILE_ICON_BACKING_SCALE,
} from '../board/architecture/boardArtSpec';
import { TILE_SURFACE_Y } from '../board/boardLayout';
import {
  getUpperIconTopAlignedLocalZ,
  type TilePanelLayout,
} from '../board/tiles/tilePanelLayout';
import {
  type BoardSvgTileIconAsset,
} from './boardIconAssets';

export const RAISED_SVG_RENDERING_PIPELINE = 'local-svg-texture-with-shallow-backing' as const;
export const RAISED_SVG_BACKING_RENDER_ORDER = 4;
export const RAISED_SVG_FACE_RENDER_ORDER = 5;

type SvgImageListener = (image: HTMLImageElement | null) => void;

interface SvgImageCacheEntry {
  image: HTMLImageElement | null;
  error: boolean;
  started: boolean;
  listeners: Set<SvgImageListener>;
}

const SVG_IMAGE_CACHE = new Map<string, SvgImageCacheEntry>();
const SVG_TEXTURE_CACHE = new Map<string, THREE.Texture>();

function getSvgImageCacheEntry(url: string): SvgImageCacheEntry {
  const existing = SVG_IMAGE_CACHE.get(url);
  if (existing) return existing;
  const entry: SvgImageCacheEntry = {
    image: null,
    error: false,
    started: false,
    listeners: new Set(),
  };
  SVG_IMAGE_CACHE.set(url, entry);
  return entry;
}

function startSvgImageLoad(url: string, entry: SvgImageCacheEntry): void {
  if (entry.started || typeof Image === 'undefined') return;
  entry.started = true;
  const image = new Image();
  image.decoding = 'async';
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    entry.image = image;
    entry.listeners.forEach(listener => listener(image));
  };
  image.onerror = () => {
    entry.error = true;
    entry.listeners.forEach(listener => listener(null));
  };
  image.src = url;
}

/** Start shared card/tile icon loading before a physical card enters focus. */
export function prewarmSharedSvgTexture(url: string): void {
  const entry = getSvgImageCacheEntry(url);
  startSvgImageLoad(url, entry);
}

function useSvgImage(url: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(
    () => getSvgImageCacheEntry(url).image,
  );

  useEffect(() => {
    const entry = getSvgImageCacheEntry(url);
    if (entry.image) {
      setImage(entry.image);
      return undefined;
    }
    const listener: SvgImageListener = nextImage => setImage(nextImage);
    entry.listeners.add(listener);
    startSvgImageLoad(url, entry);
    return () => {
      entry.listeners.delete(listener);
    };
  }, [url]);

  return image;
}

function useSvgTexture(url: string): THREE.Texture | null {
  const image = useSvgImage(url);
  const texture = useMemo(() => {
    if (!image) return null;
    const nextTexture = new THREE.Texture(image);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.minFilter = THREE.LinearMipmapLinearFilter;
    nextTexture.magFilter = THREE.LinearFilter;
    nextTexture.wrapS = THREE.ClampToEdgeWrapping;
    nextTexture.wrapT = THREE.ClampToEdgeWrapping;
    nextTexture.generateMipmaps = true;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [image]);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

/** Shared app-lifetime texture for repeated physical/icon surfaces. */
export function useSharedSvgTexture(url: string): THREE.Texture | null {
  const image = useSvgImage(url);
  return useMemo(() => {
    if (!image) return SVG_TEXTURE_CACHE.get(url) ?? null;
    const cached = SVG_TEXTURE_CACHE.get(url);
    if (cached) return cached;
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    SVG_TEXTURE_CACHE.set(url, texture);
    return texture;
  }, [image, url]);
}

export function getRaisedSvgTileIconArtSize(
  panel: TilePanelLayout,
  icon: BoardSvgTileIconAsset,
): readonly [number, number] {
  const isCorner = panel.side === 'CORNER';
  const availableSize = isCorner ? panel.surfaceSize : panel.upperSize;
  const safeWidthRatio = isCorner
    ? icon.cornerSafeWidthRatio ?? icon.safeWidthRatio
    : icon.safeWidthRatio;
  const safeHeightRatio = isCorner
    ? icon.cornerSafeHeightRatio ?? icon.safeHeightRatio
    : icon.safeHeightRatio;
  const aspectRatio = icon.viewBoxWidth / icon.viewBoxHeight;
  const targetWidth = availableSize[0] * safeWidthRatio;
  const targetHeight = availableSize[1] * safeHeightRatio;
  const height = Math.min(targetHeight, targetWidth / aspectRatio);
  return [height * aspectRatio, height];
}

interface RaisedSvgTileIconProps {
  panel: TilePanelLayout;
  icon: BoardSvgTileIconAsset;
  name: string;
}

export default function RaisedSvgTileIcon({ panel, icon, name }: RaisedSvgTileIconProps) {
  const texture = useSvgTexture(icon.url);
  const [width, height] = getRaisedSvgTileIconArtSize(panel, icon);
  const isCorner = panel.side === 'CORNER';
  const iconCenterLocalZ = isCorner
    ? 0
    : getUpperIconTopAlignedLocalZ(
      panel,
      height,
      TILE_ICON_BACKING_SCALE,
      icon.verticalBias,
    );
  const geometry = useMemo(() => new THREE.PlaneGeometry(width, height), [height, width]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group
      name={name}
      position={[0, TILE_SURFACE_Y, iconCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{
        artKind: icon.kind,
        pipeline: RAISED_SVG_RENDERING_PIPELINE,
        panelRegion: isCorner ? 'corner' : 'upper',
        placement: isCorner ? 'corner-centered' : 'upper-top-biased',
        verticalBias: icon.verticalBias,
        iconCenterLocalZ,
        upperOuterBoundaryLocalZ: panel.upperOuterBoundaryLocalZ,
        dividerLocalZ: panel.dividerLocalZ,
        meshCount: texture ? 2 : 0,
        surfaceY: TILE_SURFACE_Y,
        backingY: TILE_SURFACE_Y + TILE_ICON_BACKING_Y_OFFSET,
        faceY: TILE_SURFACE_Y + TILE_ICON_FACE_Y_OFFSET,
        depth: TILE_ICON_DEPTH,
      }}
    >
      {texture ? (
        <>
          <mesh
            name={`${name}:RaisedBacking`}
            geometry={geometry}
            position={[0, TILE_ICON_BACKING_Y_OFFSET, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[TILE_ICON_BACKING_SCALE, TILE_ICON_BACKING_SCALE, 1]}
            renderOrder={RAISED_SVG_BACKING_RENDER_ORDER}
          >
            <meshBasicMaterial
              map={texture}
              color={icon.backingColor}
              transparent
              opacity={0.84}
              alphaTest={0.01}
              depthTest
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh
            name={`${name}:SvgFace`}
            geometry={geometry}
            position={[0, TILE_ICON_FACE_Y_OFFSET, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={RAISED_SVG_FACE_RENDER_ORDER}
          >
            <meshBasicMaterial
              map={texture}
              transparent
              alphaTest={0.01}
              depthTest
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </>
      ) : null}
    </group>
  );
}
