import { describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';
import type { CompileBatch, WarmupProgram, WarmupRenderer } from './shaderCompile';
import { runShaderWarmup, warmupMarkName, type WarmupInput, type WarmupStep } from './warmupRunner';

function rendererWith(programReady: () => boolean, order: string[] = []): WarmupRenderer {
  const info = { programs: [] as unknown[] };
  const program: WarmupProgram = { isReady: programReady, getUniforms: vi.fn(), getAttributes: vi.fn() };
  return {
    getRenderTarget: () => null,
    setRenderTarget: vi.fn(),
    compile(object) {
      order.push((object as unknown as { name: string }).name);
      info.programs.push({});
      return new Set([{ id: (object as unknown as { name: string }).name } as unknown as THREE.Material]);
    },
    initTexture: vi.fn(),
    properties: { get: () => ({ currentProgram: program }) },
    extensions: { has: () => true },
    info,
  };
}

function input(overrides: Partial<WarmupInput> = {}) {
  const marks: string[] = [];
  const base: WarmupInput = {
    renderer: rendererWith(() => true),
    scene: { name: 'scene' } as unknown as THREE.Scene,
    camera: {} as THREE.Camera,
    fixtures: [],
    reason: 'initial',
    tier: 'balanced',
    signal: new AbortController().signal,
    timeoutMs: 1_000,
    mark: name => { marks.push(name); },
    setTimeout: callback => { callback(); return 0; },
  };
  return { marks, options: { ...base, ...overrides } };
}

describe('warmupMarkName', () => {
  it('uses the plain boundaries for the first warm-up and a prefixed pair for later ones', () => {
    expect(warmupMarkName('initial', 'start')).toBe('otb:warmup:start');
    expect(warmupMarkName('initial', 'done')).toBe('otb:warmup:done');
    expect(warmupMarkName('tier-switch', 'done')).toBe('otb:warmup:tier-switch:done');
    expect(warmupMarkName('context-restored', 'start')).toBe('otb:warmup:context-restored:start');
  });
});

describe('runShaderWarmup', () => {
  it('compiles the scene first, then the fixtures, then runs the steps, and only then marks done', async () => {
    const order: string[] = [];
    const events: string[] = [];
    const fixtures: CompileBatch[] = [{ name: 'fixtures', object: { name: 'fixtures' } as unknown as THREE.Object3D }];
    const step: WarmupStep = { name: 'textures', run: () => { events.push('step'); return Promise.resolve('ready'); } };
    const { marks, options } = input({
      renderer: rendererWith(() => true, order),
      fixtures,
      steps: [step],
      mark: name => { events.push(name); marks.push(name); },
    });

    const report = await runShaderWarmup(options);

    expect(order).toEqual(['scene', 'fixtures']);
    expect(events).toEqual(['otb:warmup:start', 'step', 'otb:warmup:done']);
    expect(report.outcome).toBe('complete');
    expect(report.steps.map(entry => entry.name)).toEqual(['scene', 'fixtures', 'textures']);
    expect(report.programsAfter - report.programsBefore).toBe(2);
  });

  it('never marks done while a program is still compiling: a timeout is incomplete', async () => {
    let now = 0;
    const { marks, options } = input({
      renderer: rendererWith(() => false),
      timeoutMs: 50,
      now: () => now,
      setTimeout: (callback, delay) => { now += delay + 20; callback(); return 0; },
    });

    const report = await runShaderWarmup(options);

    expect(report.outcome).toBe('incomplete');
    expect(marks).toEqual(['otb:warmup:start', 'otb:warmup:incomplete']);
  });

  it('marks aborted, not done, when its signal aborts', async () => {
    const controller = new AbortController();
    const { marks, options } = input({
      renderer: rendererWith(() => false),
      signal: controller.signal,
      setTimeout: callback => { controller.abort(); callback(); return 0; },
    });

    const report = await runShaderWarmup(options);

    expect(report.outcome).toBe('aborted');
    expect(marks).toEqual(['otb:warmup:start', 'otb:warmup:aborted']);
  });

  it('reports a throwing renderer as aborted and still returns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const renderer = rendererWith(() => true);
    renderer.compile = () => { throw new Error('context lost'); };
    const { marks, options } = input({ renderer });

    const report = await runShaderWarmup(options);

    expect(report.outcome).toBe('aborted');
    expect(marks).toEqual(['otb:warmup:start', 'otb:warmup:aborted']);
    warn.mockRestore();
  });

  it('awaits its prerequisite before compiling anything', async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { options } = input({
      renderer: rendererWith(() => true, order),
      prerequisite: async () => { order.push('prerequisite-start'); await gate; order.push('prerequisite-done'); },
    });

    const running = runShaderWarmup(options);
    await Promise.resolve();
    expect(order).toEqual(['prerequisite-start']);
    release();
    await running;

    expect(order).toEqual(['prerequisite-start', 'prerequisite-done', 'scene']);
  });

  it('compiles nothing and marks aborted when it is cancelled while it waits for the prerequisite', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const order: string[] = [];
    const controller = new AbortController();
    const { marks, options } = input({
      renderer: rendererWith(() => true, order),
      signal: controller.signal,
      prerequisite: () => { controller.abort(); return Promise.resolve(); },
    });

    const report = await runShaderWarmup(options);

    expect(report.outcome).toBe('aborted');
    expect(order).toEqual([]);
    expect(marks).toEqual(['otb:warmup:start', 'otb:warmup:aborted']);
    // A cancellation is not a failure: nothing is logged.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips the steps once compilation did not finish', async () => {
    const run = vi.fn(() => Promise.resolve('ready' as const));
    let now = 0;
    const { options } = input({
      renderer: rendererWith(() => false),
      timeoutMs: 10,
      now: () => now,
      setTimeout: (callback, delay) => { now += delay + 20; callback(); return 0; },
      steps: [{ name: 'textures', run }],
    });
    await runShaderWarmup(options);
    expect(run).not.toHaveBeenCalled();
  });

  it('uses the render target and batches the tier resolves, and labels later warm-ups by their reason', async () => {
    const target = { id: 'input-buffer' } as unknown as THREE.WebGLRenderTarget;
    const compiled: Array<{ name: string; target: unknown }> = [];
    const renderer = rendererWith(() => true);
    const bound: unknown[] = [];
    renderer.setRenderTarget = next => { bound.push(next); };
    renderer.compile = object => {
      compiled.push({ name: (object as unknown as { name: string }).name, target: bound.at(-1) ?? null });
      return new Set();
    };
    const { marks, options } = input({
      renderer,
      reason: 'tier-switch',
      tier: 'high',
      resolveTier: () => Promise.resolve({
        sceneTarget: target,
        batches: [{ name: 'post', object: { name: 'post' } as unknown as THREE.Object3D, renderTarget: null }],
      }),
    });

    await runShaderWarmup(options);

    expect(compiled).toEqual([{ name: 'scene', target }, { name: 'post', target: null }]);
    expect(marks).toEqual(['otb:warmup:tier-switch:start', 'otb:warmup:tier-switch:done']);
  });
});
