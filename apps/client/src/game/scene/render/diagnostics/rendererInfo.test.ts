import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FrameCounter, shadowMapTypeName, toneMappingName, type CountableRenderer } from './rendererInfo';

class FakeShadowMap {
  constructor(private readonly renderer: FakeRenderer) {}

  render(): void {
    this.renderer.info.render.calls += 7;
    this.renderer.info.render.triangles += 700;
  }
}

class FakeRenderer implements CountableRenderer {
  info = {
    autoReset: true,
    reset: vi.fn(() => {
      this.info.render.calls = 0;
      this.info.render.triangles = 0;
    }),
    render: { calls: 0, triangles: 0 },
  };

  shadowMap = new FakeShadowMap(this);

  shadowsEnabled = false;

  render(scene: THREE.Object3D, camera: THREE.Camera): void {
    void camera;
    if (this.info.autoReset) this.info.reset();
    if (scene.type === 'Scene' && this.shadowsEnabled) this.shadowMap.render();
    const isMain = scene.name === 'main';
    this.info.render.calls += isMain ? 100 : 1;
    this.info.render.triangles += isMain ? 5_000 : 2;
  }
}

function makeScenes() {
  const main = new THREE.Scene();
  main.name = 'main';
  const post = new THREE.Scene();
  post.name = 'post';
  return { main, post, camera: new THREE.PerspectiveCamera() };
}

describe('names', () => {
  it('maps tone mapping and shadow map constants', () => {
    expect(toneMappingName(THREE.ACESFilmicToneMapping)).toBe('ACESFilmicToneMapping');
    expect(toneMappingName(THREE.NeutralToneMapping)).toBe('NeutralToneMapping');
    expect(toneMappingName(THREE.NoToneMapping)).toBe('NoToneMapping');
    expect(shadowMapTypeName(THREE.PCFShadowMap)).toBe('PCFShadowMap');
    expect(shadowMapTypeName(THREE.VSMShadowMap)).toBe('VSMShadowMap');
  });
});

describe('FrameCounter', () => {
  it('counts the main pass and turns the automatic info reset off', () => {
    const renderer = new FakeRenderer();
    const { main, camera } = makeScenes();
    const counter = new FrameCounter(renderer, main);
    expect(renderer.info.autoReset).toBe(false);

    counter.beginFrame();
    renderer.render(main, camera);

    expect(counter.stats).toMatchObject({
      frameSequence: 1, mainDrawCalls: 100, shadowDrawCalls: 0, postDrawCalls: 0, postRenders: 0, totalDrawCalls: 100,
      mainTriangles: 5_000,
    });
  });

  it('separates shadow-map draws from the main pass', () => {
    const renderer = new FakeRenderer();
    renderer.shadowsEnabled = true;
    const { main, camera } = makeScenes();
    const counter = new FrameCounter(renderer, main);

    counter.beginFrame();
    renderer.render(main, camera);

    expect(counter.stats.shadowDrawCalls).toBe(7);
    expect(counter.stats.mainDrawCalls).toBe(100);
    expect(counter.stats.mainTriangles).toBe(5_000);
    expect(counter.stats.totalDrawCalls).toBe(107);
  });

  it('counts every non-scene render as a post pass', () => {
    const renderer = new FakeRenderer();
    const { main, post, camera } = makeScenes();
    const counter = new FrameCounter(renderer, main);

    counter.beginFrame();
    renderer.render(main, camera);
    renderer.render(post, camera);
    renderer.render(post, camera);

    expect(counter.stats).toMatchObject({ mainDrawCalls: 100, postDrawCalls: 2, postRenders: 2, totalDrawCalls: 102 });
  });

  it('starts every frame from zero while the sequence keeps growing', () => {
    const renderer = new FakeRenderer();
    const { main, camera } = makeScenes();
    const counter = new FrameCounter(renderer, main);

    counter.beginFrame();
    renderer.render(main, camera);
    counter.beginFrame();
    expect(counter.stats.mainDrawCalls).toBe(0);
    renderer.render(main, camera);

    expect(counter.stats.frameSequence).toBe(2);
    expect(counter.stats.mainDrawCalls).toBe(100);
  });

  it('notifies subscribers after each main render only, and stops after unsubscribe', () => {
    const renderer = new FakeRenderer();
    const { main, post, camera } = makeScenes();
    const counter = new FrameCounter(renderer, main);
    const listener = vi.fn();
    const unsubscribe = counter.subscribe(listener);

    counter.beginFrame();
    renderer.render(main, camera);
    renderer.render(post, camera);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    counter.beginFrame();
    renderer.render(main, camera);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('restores the renderer on dispose', () => {
    const renderer = new FakeRenderer();
    const { main, camera } = makeScenes();
    const counter = new FrameCounter(renderer, main);
    counter.dispose();

    expect(renderer.info.autoReset).toBe(true);
    expect(Object.hasOwn(renderer, 'render')).toBe(false);
    expect(Object.hasOwn(renderer.shadowMap, 'render')).toBe(false);
    renderer.render(main, camera);
    expect(counter.stats.frameSequence).toBe(0);
  });
});
