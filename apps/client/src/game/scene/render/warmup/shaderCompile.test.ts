import { describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';
import {
  compileBatches,
  programCount,
  type CompileBatch,
  type WarmupProgram,
  type WarmupRenderer,
} from './shaderCompile';

interface FakeProgram extends WarmupProgram {
  polls: number;
  uniformsRead: number;
  attributesRead: number;
}

function fakeProgram(readyAfterPolls = 0): FakeProgram {
  const program: FakeProgram = {
    polls: 0,
    uniformsRead: 0,
    attributesRead: 0,
    isReady() {
      program.polls += 1;
      return program.polls > readyAfterPolls;
    },
    getUniforms() { program.uniformsRead += 1; },
    getAttributes() { program.attributesRead += 1; },
  };
  return program;
}

interface FakeMaterial { id: string; program: FakeProgram }

/** A renderer whose `compile()` creates the programs listed on the object it is given. */
function fakeRenderer(parallel = true) {
  const programs = new Map<string, FakeProgram>();
  const info = { programs: [] as unknown[] };
  const calls: Array<{ name: string; target: unknown }> = [];
  let target: THREE.WebGLRenderTarget | null = null;
  const renderer: WarmupRenderer = {
    getRenderTarget: () => target,
    setRenderTarget: next => { target = next; },
    compile(object) {
      const entry = object as unknown as { name: string; materials: FakeMaterial[] };
      calls.push({ name: entry.name, target });
      for (const { id, program } of entry.materials) {
        if (!programs.has(id)) info.programs.push({ id });
        programs.set(id, program);
      }
      return new Set(entry.materials.map(({ id }) => ({ id }) as unknown as THREE.Material));
    },
    initTexture: vi.fn(),
    properties: {
      get: material => ({ currentProgram: programs.get((material as { id: string }).id) }),
    },
    extensions: { has: name => parallel && name === 'KHR_parallel_shader_compile' },
    info,
  };
  return { renderer, calls };
}

const batch = (name: string, materials: FakeMaterial[], extra: Partial<CompileBatch> = {}): CompileBatch => (
  { name, object: { name, materials } as unknown as THREE.Object3D, ...extra }
);

const camera = {} as THREE.Camera;
const immediate = (callback: () => void) => { callback(); return 0; };

describe('compileBatches', () => {
  it('starts every batch before waiting and finishes each program once', async () => {
    const { renderer, calls } = fakeRenderer();
    const shared = fakeProgram(2);
    const slow = fakeProgram(4);
    const result = await compileBatches(
      renderer,
      [
        batch('scene', [{ id: 'a', program: shared }, { id: 'b', program: shared }]),
        batch('fixtures', [{ id: 'c', program: slow }]),
      ],
      camera,
      { timeoutMs: 10_000, setTimeout: immediate },
    );

    expect(calls.map(call => call.name)).toEqual(['scene', 'fixtures']);
    expect(result.status).toBe('ready');
    expect(result.parallel).toBe(true);
    expect(result.batches.map(entry => [entry.name, entry.status, entry.materials, entry.programsAdded])).toEqual([
      ['scene', 'ready', 2, 2],
      ['fixtures', 'ready', 1, 1],
    ]);
    // Two materials share one program: its first use is performed once.
    expect([shared.uniformsRead, shared.attributesRead]).toEqual([1, 1]);
    expect([slow.uniformsRead, slow.attributesRead]).toEqual([1, 1]);
  });

  it('binds the batch render target only while compiling and restores the previous one', async () => {
    const { renderer, calls } = fakeRenderer();
    const target = { id: 'rt' } as unknown as THREE.WebGLRenderTarget;
    const previous = { id: 'previous' } as unknown as THREE.WebGLRenderTarget;
    renderer.setRenderTarget(previous);
    await compileBatches(
      renderer,
      [
        batch('depth', [{ id: 'd', program: fakeProgram() }], { renderTarget: target }),
        batch('screen', [{ id: 's', program: fakeProgram() }]),
      ],
      camera,
      { timeoutMs: 1_000, setTimeout: immediate },
    );
    expect(calls).toEqual([{ name: 'depth', target }, { name: 'screen', target: previous }]);
    expect(renderer.getRenderTarget()).toBe(previous);
  });

  it('restores the render target even when compile throws', async () => {
    const { renderer } = fakeRenderer();
    const target = {} as THREE.WebGLRenderTarget;
    renderer.compile = () => { throw new Error('driver'); };
    await expect(compileBatches(renderer, [batch('depth', [], { renderTarget: target })], camera, { timeoutMs: 1_000 }))
      .rejects.toThrow('driver');
    expect(renderer.getRenderTarget()).toBeNull();
  });

  it('stops with timeout when a program never becomes ready', async () => {
    const { renderer } = fakeRenderer();
    let now = 0;
    const result = await compileBatches(
      renderer,
      [batch('scene', [{ id: 'a', program: fakeProgram(Number.POSITIVE_INFINITY) }])],
      camera,
      { timeoutMs: 100, now: () => now, setTimeout: (callback, delay) => { now += delay + 30; callback(); return 0; } },
    );
    expect(result.status).toBe('timeout');
    expect(result.batches[0].status).toBe('timeout');
  });

  it('stops with aborted as soon as the signal aborts, without finishing programs that are not ready', async () => {
    const { renderer } = fakeRenderer();
    const controller = new AbortController();
    const program = fakeProgram(Number.POSITIVE_INFINITY);
    const result = await compileBatches(
      renderer,
      [batch('scene', [{ id: 'a', program }])],
      camera,
      { timeoutMs: 60_000, signal: controller.signal, setTimeout: callback => { controller.abort(); callback(); return 0; } },
    );
    expect(result.status).toBe('aborted');
    expect(program.uniformsRead).toBe(0);
  });

  it('without parallel compile does the first use itself and never polls readiness', async () => {
    const { renderer } = fakeRenderer(false);
    const programs = Array.from({ length: 5 }, () => fakeProgram(Number.POSITIVE_INFINITY));
    const result = await compileBatches(
      renderer,
      [batch('scene', programs.map((program, index) => ({ id: `m${index}`, program })))],
      camera,
      { timeoutMs: 60_000, setTimeout: immediate },
    );
    expect(result.parallel).toBe(false);
    expect(result.status).toBe('ready');
    expect(programs.every(program => program.uniformsRead === 1 && program.attributesRead === 1)).toBe(true);
    expect(programs.every(program => program.polls === 0)).toBe(true);
  });

  it('yields to the browser between slices of first-use work', async () => {
    const { renderer } = fakeRenderer(false);
    let now = 0;
    const programs = Array.from({ length: 6 }, () => {
      const program = fakeProgram();
      // Each first use costs 5 ms of the fake clock, so a slice of about 8 ms holds two programs.
      program.getUniforms = () => { now += 5; };
      return program;
    });
    let yields = 0;
    await compileBatches(
      renderer,
      [batch('scene', programs.map((program, index) => ({ id: `m${index}`, program })))],
      camera,
      { timeoutMs: 60_000, now: () => now, setTimeout: callback => { yields += 1; callback(); return 0; } },
    );
    expect(yields).toBe(3);
  });
});

describe('programCount', () => {
  it('reads the renderer program list and tolerates its absence', () => {
    expect(programCount({ info: { programs: [1, 2, 3] } })).toBe(3);
    expect(programCount({ info: {} })).toBe(0);
    expect(programCount({ info: { programs: null } })).toBe(0);
  });
});
