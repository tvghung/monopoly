import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { collectPassMaterials, collectPostChainMaterials, createFullscreenTriangle } from './warmupPostChain';

const shader = () => new THREE.ShaderMaterial();

describe('collectPassMaterials', () => {
  it('finds the material of a pass, of its effects and of nested sub-passes', () => {
    const own = shader();
    const nestedA = shader();
    const nestedB = shader();
    const meshOwned = shader();
    const pass = {
      fullscreenMaterial: own,
      effects: [{ luminancePass: { fullscreenMaterial: nestedA }, mipmapBlurPass: { upsampling: { material: nestedB } } }],
      quad: new THREE.Mesh(new THREE.BufferGeometry(), meshOwned),
    };

    expect(new Set(collectPassMaterials(pass))).toEqual(new Set([own, nestedA, nestedB, meshOwned]));
  });

  it('ignores standard materials and does not walk into the scene, the renderer, textures or targets', () => {
    const decoy = shader();
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), decoy));
    const pass = {
      scene,
      camera: new THREE.PerspectiveCamera(),
      renderer: { isWebGLRenderer: true, secret: decoy },
      target: Object.assign(new THREE.WebGLRenderTarget(1, 1), { secret: decoy }),
      standard: new THREE.MeshBasicMaterial(),
    };
    expect(collectPassMaterials(pass)).toEqual([]);
  });

  it('survives cycles and bounds its depth', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let level = 0; level < 20; level += 1) { cursor.next = {}; cursor = cursor.next as Record<string, unknown>; }
    cursor.material = shader();
    expect(collectPassMaterials({ cyclic, deep })).toEqual([]);
  });
});

describe('collectPostChainMaterials', () => {
  it('lists the materials of enabled passes once, flagging the pass that draws to the screen', () => {
    const shared = shader();
    const lastOnly = shader();
    const disabledOnly = shader();
    const chain = {
      passes: [
        { enabled: true, name: 'AOPass', renderToScreen: false, material: shared },
        { enabled: false, name: 'Disabled', material: disabledOnly },
        { enabled: true, name: 'EffectPass', renderToScreen: true, material: lastOnly, again: shared },
      ],
    };

    const found = collectPostChainMaterials(chain);

    expect(found.map(entry => [entry.owner, entry.toScreen, entry.material === shared || entry.material === lastOnly])).toEqual([
      ['AOPass', false, true],
      ['EffectPass', true, true],
    ]);
  });
});

describe('createFullscreenTriangle', () => {
  it('has the position and uv layout the post passes draw with, and no normals', () => {
    const geometry = createFullscreenTriangle();
    expect(geometry.getAttribute('position').count).toBe(3);
    expect(geometry.getAttribute('uv').itemSize).toBe(2);
    expect(geometry.getAttribute('normal')).toBeUndefined();
  });
});
