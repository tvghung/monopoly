import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DestinationPreviewRenderModel } from '../boardRenderModel';
import { TILE_SURFACE_CLEARANCE_Y, TILE_SURFACE_LOCAL_POSITION } from '../boardLayout';
import type { TilePanelLayout } from './tilePanelLayout';

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

function createDestinationFrameGeometry(width: number, depth: number, thickness: number) {
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
  const frameGeometry = useMemo(
    () => createDestinationFrameGeometry(surfaceWidth, surfaceDepth, edgeThickness),
    [edgeThickness, surfaceDepth, surfaceWidth],
  );
  const surfaceMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const edgeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const elapsedRef = useRef(0);
  const lastDiagnosticEventMsRef = useRef(Number.NEGATIVE_INFINITY);
  const invalidate = useThree(state => state.invalidate);
  const diagnosticsEnabled = typeof window !== 'undefined'
    && (window.location.hostname === '127.0.0.1'
      || window.location.hostname === 'localhost'
      || new URLSearchParams(window.location.search).get('phase4-uat') === '1');
  useEffect(() => {
    elapsedRef.current = 0;
    lastDiagnosticEventMsRef.current = Number.NEGATIVE_INFINITY;
    invalidate();
    return () => {
      if (diagnosticsEnabled) delete window.__OWN_THE_BLOCK_DESTINATION_PREVIEW_DIAGNOSTICS__;
    };
  }, [diagnosticsEnabled, invalidate, signal.id]);
  useFrame((_, delta) => {
    const surfaceMaterial = surfaceMaterialRef.current;
    const edgeMaterial = edgeMaterialRef.current;
    if (!surfaceMaterial || !edgeMaterial) return;
    elapsedRef.current += delta * 1000;
    const opacity = getDestinationPreviewOpacity(elapsedRef.current, reducedMotion);
    surfaceMaterial.opacity = opacity.surfaceOpacity;
    edgeMaterial.opacity = opacity.edgeOpacity;
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
        <meshBasicMaterial ref={surfaceMaterialRef} color={signal.surfaceColor} transparent opacity={DESTINATION_PREVIEW_STATIC_SURFACE_OPACITY} depthWrite={false} blending={THREE.NormalBlending} toneMapped={false} />
      </mesh>
      <mesh geometry={frameGeometry} position={[0, DESTINATION_PREVIEW_FRAME_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial ref={edgeMaterialRef} color={signal.edgeColor} transparent opacity={DESTINATION_PREVIEW_STATIC_EDGE_OPACITY} depthWrite={false} blending={THREE.NormalBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}
