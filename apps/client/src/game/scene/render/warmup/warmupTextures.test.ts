import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { collectTextures, uploadTextures } from './warmupTextures';

function readyTexture(): THREE.Texture {
  const texture = new THREE.Texture({ complete: true, width: 4, height: 4 } as unknown as HTMLImageElement);
  texture.needsUpdate = true;
  return texture;
}

describe('collectTextures', () => {
  it('finds map-like properties and shader uniforms once, and only ready textures', () => {
    const map = readyTexture();
    const normal = readyTexture();
    const uniformTexture = readyTexture();
    const neverUploaded = new THREE.Texture({ complete: true } as unknown as HTMLImageElement);
    const incomplete = new THREE.Texture({ complete: false } as unknown as HTMLImageElement);
    incomplete.needsUpdate = true;
    const renderTargetTexture = new THREE.WebGLRenderTarget(2, 2).texture;
    renderTargetTexture.needsUpdate = true;

    const shared = new THREE.MeshStandardMaterial({ map, normalMap: normal });
    const shader = new THREE.ShaderMaterial({ uniforms: { shadowTexture: { value: uniformTexture }, other: { value: 1 } } });
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), shared));
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), shared));
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), shader));
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: neverUploaded })));
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: incomplete })));
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: renderTargetTexture })));
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), [new THREE.MeshBasicMaterial({ alphaMap: map })]));

    const found = collectTextures([scene]);

    expect(new Set(found)).toEqual(new Set([map, normal, uniformTexture]));
    expect(found).toHaveLength(3);
  });
});

describe('uploadTextures', () => {
  it('uploads every texture and yields between slices', async () => {
    let now = 0;
    const renderer = { initTexture: vi.fn(() => { now += 5; }) };
    let yields = 0;
    const status = await uploadTextures(renderer, [readyTexture(), readyTexture(), readyTexture(), readyTexture()], {
      signal: new AbortController().signal,
      deadlineMs: 10_000,
      now: () => now,
      setTimeout: callback => { yields += 1; callback(); return 0; },
    });
    expect(status).toBe('ready');
    expect(renderer.initTexture).toHaveBeenCalledTimes(4);
    expect(yields).toBe(2);
  });

  it('stops when aborted or past its deadline', async () => {
    const controller = new AbortController();
    const renderer = { initTexture: vi.fn(() => { controller.abort(); }) };
    const aborted = await uploadTextures(renderer, [readyTexture(), readyTexture()], {
      signal: controller.signal,
      deadlineMs: 10_000,
    });
    expect(aborted).toBe('aborted');
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);

    const late = await uploadTextures({ initTexture: vi.fn() }, [readyTexture()], {
      signal: new AbortController().signal,
      deadlineMs: -1,
    });
    expect(late).toBe('timeout');
  });
});
