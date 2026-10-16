import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DestinationPreviewRenderModel } from '../boardRenderModel';
import { TILE_SURFACE_CLEARANCE_Y, TILE_SURFACE_LOCAL_POSITION } from '../boardLayout';
import type { TilePanelLayout } from './tilePanelLayout';
import { getAnimationElapsedMs } from '../../animationTime';
import { isLocalDiagnosticsEnabled } from '../../render/diagnostics/localDiagnostics';

export const DESTINATION_PREVIEW_EPSILON = 0.012;
export const DESTINATION_PREVIEW_SURFACE_Y = Math.max(
  TILE_SURFACE_LOCAL_POSITION[1],
  TILE_SURFACE_CLEARANCE_Y,
) + DESTINATION_PREVIEW_EPSILON;
export const DESTINATION_PREVIEW_FRAME_Y = DESTINATION_PREVIEW_SURFACE_Y + 0.008;
export const DESTINATION_PREVIEW_PULSE_PERIOD_MS = 460;
export const DESTINATION_PREVIEW_STATIC_SURFACE_OPACITY = 0.2;
export const DESTINATION_PREVIEW_STATIC_EDGE_OPACITY = 0.62;

export interface DestinationPreviewOpacity {
  surfaceOpacity: number;
  edgeOpacity: number;
}

export function getDestinationPreviewOpacity(
  elapsedMs: number,
  reducedMotion = false,
): DestinationPreviewOpacity {
  if (reducedMotion) {
    return {
      surfaceOpacity: DESTINATION_PREVIEW_STATIC_SURFACE_OPACITY,
      edgeOpacity: DESTINATION_PREVIEW_STATIC_EDGE_OPACITY,
    };
  }
  const phase = ((Math.max(0, elapsedMs) % DESTINATION_PREVIEW_PULSE_PERIOD_MS)
    / DESTINATION_PREVIEW_PULSE_PERIOD_MS) * Math.PI * 2;
  const sinePulse = 0.5 - Math.cos(phase) * 0.5;
  const pulse = sinePulse * sinePulse * (3 - 2 * sinePulse);
  return {
    surfaceOpacity: 0.12 + pulse * 0.25,
    edgeOpacity: 0.42 + pulse * 0.46,
  };
}

export function createDestinationFrameGeometry(width: number, depth: number, thickness: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-width / 2 + thickness, -depth / 2 + thickness);
  hole.lineTo(-width / 2 + thickness, depth / 2 - thickness);
  hole.lineTo(width / 2 - thickness, depth / 2 - thickness);
  hole.lineTo(width / 2 - thickness, -depth / 2 + thickness);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

/**
 * The frame geometry is passed to the mesh as a prop, and R3F only disposes objects it created from JSX, so the component
 * that builds it must also release it (audit PERF-15: one geometry leaked per move). Rebuilt only when a size changes.
 */
export function useDestinationFrameGeometry(width: number, depth: number, thickness: number): THREE.ShapeGeometry {
  const geometry = useMemo(
    () => createDestinationFrameGeometry(width, depth, thickness),
    [width, depth, thickness],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export interface DestinationPreviewMaterials {
  surface: THREE.MeshBasicMaterial;
  edge: THREE.MeshBasicMaterial;
}

function createPreviewMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

export function createDestinationPreviewMaterials(): DestinationPreviewMaterials {
  return {
    surface: createPreviewMaterial(DESTINATION_PREVIEW_STATIC_SURFACE_OPACITY),
    edge: createPreviewMaterial(DESTINATION_PREVIEW_STATIC_EDGE_OPACITY),
  };
}

function disposeDestinationPreviewMaterials(materials: DestinationPreviewMaterials): void {
  materials.surface.dispose();
  materials.edge.dispose();
}

/** Provided by the board, which lives as long as the scene: see `useDestinationPreviewMaterialsOwner`. */
export const DestinationPreviewMaterialsContext = createContext<DestinationPreviewMaterials | null>(null);

/**
 * The preview's two materials, owned by the always-mounted board and handed down through context. The preview itself is
 * mounted once per move and unmounts right after, and a material disposed with it released its shader program, so every move
 * linked the identical program again on the main thread (audit PERF-05). The color is set per preview, the opacity per frame.
 */
export function useDestinationPreviewMaterialsOwner(): DestinationPreviewMaterials {
  const materials = useMemo(() => createDestinationPreviewMaterials(), []);
  useEffect(() => () => disposeDestinationPreviewMaterials(materials), [materials]);
  return materials;
}

/**
 * The materials a preview draws with: the board's shared pair when there is one, otherwise a pair of its own (a preview
 * rendered outside a board, such as in a test or an isolated scene), disposed with it. A preview never disposes the shared pair.
 */
export function useDestinationPreviewMaterials(): DestinationPreviewMaterials {
  const shared = useContext(DestinationPreviewMaterialsContext);
  const materials = useMemo(() => shared ?? createDestinationPreviewMaterials(), [shared]);
  const ownsMaterials = shared === null;
  useEffect(
    () => (ownsMaterials ? () => disposeDestinationPreviewMaterials(materials) : undefined),
    [materials, ownsMaterials],
  );
  return materials;
}

export default function TileDestinationPreview({
  panel,
  signal,
  reducedMotion = false,
}: {
  panel: TilePanelLayout;
  signal: DestinationPreviewRenderModel;
  reducedMotion?: boolean;
}) {
  const surfaceWidth = panel.surfaceSize[0] * 0.92;
  const surfaceDepth = panel.surfaceSize[1] * 0.92;
  const edgeThickness = 0.045;
  const frameGeometry = useDestinationFrameGeometry(surfaceWidth, surfaceDepth, edgeThickness);
  const materials = useDestinationPreviewMaterials();
  // The frame loop writes the opacity into whichever pair is current, so it reaches them through a ref.
  const materialsRef = useRef(materials);
  useLayoutEffect(() => {
    materialsRef.current = materials;
  }, [materials]);
  const elapsedRef = useRef(0);
  const startedAtMsRef = useRef(0);
  const lastDiagnosticEventMsRef = useRef(Number.NEGATIVE_INFINITY);
  const invalidate = useThree(state => state.invalidate);
  const diagnosticsEnabled = isLocalDiagnosticsEnabled();
  // The shared materials outlive this preview, so this preview sets the colors it wants (R3F did, from the JSX props).
  useLayoutEffect(() => {
    materials.surface.color.set(signal.surfaceColor);
    materials.edge.color.set(signal.edgeColor);
    invalidate();
  }, [invalidate, materials, signal.edgeColor, signal.surfaceColor]);
  useLayoutEffect(() => {
    startedAtMsRef.current = performance.now();
    elapsedRef.current = 0;
    lastDiagnosticEventMsRef.current = Number.NEGATIVE_INFINITY;
    invalidate();
    return () => {
      if (diagnosticsEnabled) delete window.__OWN_THE_BLOCK_DESTINATION_PREVIEW_DIAGNOSTICS__;
    };
  }, [diagnosticsEnabled, invalidate, signal.id]);
  useFrame(() => {
    elapsedRef.current = getAnimationElapsedMs(startedAtMsRef.current);
    const opacity = getDestinationPreviewOpacity(elapsedRef.current, reducedMotion);
    const { surface, edge } = materialsRef.current;
    surface.opacity = opacity.surfaceOpacity;
    edge.opacity = opacity.edgeOpacity;
    if (diagnosticsEnabled) {
      const diagnostics = {
        tileId: signal.tileId,
        pulsePeriodMs: DESTINATION_PREVIEW_PULSE_PERIOD_MS,
        reducedMotion,
        elapsedMs: elapsedRef.current,
        surfaceOpacity: opacity.surfaceOpacity,
        edgeOpacity: opacity.edgeOpacity,
        surfaceColor: signal.surfaceColor,
        edgeColor: signal.edgeColor,
      };
      window.__OWN_THE_BLOCK_DESTINATION_PREVIEW_DIAGNOSTICS__ = diagnostics;
      if (elapsedRef.current - lastDiagnosticEventMsRef.current >= 100) {
        lastDiagnosticEventMsRef.current = elapsedRef.current;
        window.dispatchEvent(new CustomEvent('own-the-block-destination-preview', {
          detail: diagnostics,
        }));
      }
    }
    if (!reducedMotion) invalidate();
  });
  return (
    <group name={`DestinationPreview:${signal.tileId}`}>
      <mesh position={[0, DESTINATION_PREVIEW_SURFACE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[surfaceWidth, surfaceDepth]} />
        <primitive object={materials.surface} attach="material" dispose={null} />
      </mesh>
      <mesh geometry={frameGeometry} position={[0, DESTINATION_PREVIEW_FRAME_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <primitive object={materials.edge} attach="material" dispose={null} />
      </mesh>
    </group>
  );
}
