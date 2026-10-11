import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTileMotionController } from './TileMotionProvider';

/** Dev/UAT only: a frozen clock and real scene matrices for deterministic impact captures. */
export const tileImpactProbeClock = { now: 0 };

export default function TileImpactProbe() {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const invalidate = useThree(state => state.invalidate);
  const controller = useTileMotionController();
  useEffect(() => {
    if (!controller) return;
    const frames: unknown[] = [];
    const images: Record<number, string> = {};
    const previousSample = window.__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__;
    const probe = {
      press(this: void, tileId: number) {
        frames.length = 0;
        Object.keys(images).forEach(key => delete images[Number(key)]);
        controller.reset();
        tileImpactProbeClock.now = 0;
        controller.press(tileId, 'LAND', { delayMs: 0, depressDurationMs: 100, reboundDurationMs: 200 });
      },
      seek(ms: number) {
        tileImpactProbeClock.now = ms;
        controller.advance(ms);
        invalidate();
      },
      sample(this: void, tileId: number) {
        scene.updateMatrixWorld(true);
        const layers: Record<string, number> = {};
        scene.traverse(object => {
          if (object instanceof THREE.InstancedMesh) {
            const ids = object.userData.tileIds as number[] | undefined;
            const highlightIds = Array.from({ length: 40 }, (_, id) => id).filter(id => id % 10 !== 0).concat([0, 10, 20, 30]);
            const index = ids?.indexOf(tileId) ?? (object.name === 'TileImpactHighlightBatch' ? highlightIds.indexOf(tileId) : -1);
            if (index < 0) return;
            const matrix = new THREE.Matrix4();
            object.getMatrixAt(index, matrix);
            layers[object.name] = matrix.elements[13];
          }
        });
        const root = scene.getObjectByName('TilePressRoot:' + tileId);
        const preview = scene.getObjectByName('DestinationPreview:' + tileId);
        return { offset: controller.getTileOffsetY(tileId), root: root?.position.y, layers,
          previewY: preview?.matrixWorld.elements[13] ?? null,
          memory: { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures } };
      },
    };
    let activeTile = 1;
    const originalPress = probe.press;
    probe.press = tileId => { activeTile = tileId; originalPress(tileId); };
    const onFrame: NonNullable<Window['__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__']> = sample => {
      previousSample?.(sample);
      if (!images[tileImpactProbeClock.now]) images[tileImpactProbeClock.now] = gl.domElement.toDataURL('image/png');
      if (frames.length < 256) frames.push({ time: tileImpactProbeClock.now, drawCalls: sample.drawCalls, triangles: sample.triangles, ...probe.sample(activeTile) });
    };
    window.__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__ = onFrame;
    const originalSample = probe.sample;
    const published = { ...probe, sample: (tileId: number) => ({ ...originalSample(tileId), frames: frames.slice(), images: { ...images } }) };
    const target = window as unknown as { __OWN_THE_BLOCK_TILE_IMPACT_PROBE__?: typeof published };
    target.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__ = published;
    return () => {
      if (window.__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__ === onFrame) {
        if (previousSample) window.__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__ = previousSample;
        else delete window.__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__;
      }
      delete target.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__;
    };
  }, [controller, gl, invalidate, scene]);
  return null;
}
