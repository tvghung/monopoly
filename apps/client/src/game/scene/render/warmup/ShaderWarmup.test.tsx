import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WarmupHost } from './warmupHost';
import type { WarmupInput, WarmupReport } from './warmupRunner';

const fiber = vi.hoisted(() => ({ useThree: vi.fn() }));
const runner = vi.hoisted(() => ({ runShaderWarmup: vi.fn() }));

vi.mock('@react-three/fiber', async importOriginal => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  useThree: fiber.useThree,
}));
vi.mock('./warmupRunner', async importOriginal => ({
  ...(await importOriginal<typeof import('./warmupRunner')>()),
  runShaderWarmup: runner.runShaderWarmup,
}));

// Other test files in the same worker import the real react-three-fiber before this file's mock is registered, so the modules
// under test (and the contexts they read) are loaded fresh, after the mocks, for every test.
let ShaderWarmup: typeof import('./ShaderWarmup').default;
let RenderQualityContext: typeof import('../RenderQualityContext').RenderQualityContext;
let WarmupHostContext: typeof import('./warmupHost').WarmupHostContext;
let RENDER_QUALITY_CONFIGS: typeof import('../renderQuality').RENDER_QUALITY_CONFIGS;

function report(overrides: Partial<WarmupReport> = {}): WarmupReport {
  return {
    reason: 'initial', tier: 'balanced', outcome: 'complete', parallel: true, startedAtMs: 0, durationMs: 1, fixtureBuildMs: 0,
    programsBefore: 0, programsAfter: 0, steps: [], ...overrides,
  };
}

function setup() {
  const canvas = document.createElement('canvas');
  const invalidate = vi.fn();
  const gl = { domElement: canvas, shadowMap: { enabled: true } };
  const state = { gl, scene: { traverse: vi.fn() }, camera: {}, get: () => ({ invalidate }) };
  fiber.useThree.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
  const hold = vi.fn();
  const release = vi.fn();
  const host: WarmupHost = {
    hold, release, registerPostChain: vi.fn(), waitForPostChain: vi.fn(() => Promise.resolve(null)),
  };
  const wrap = (tier: 'low' | 'balanced' | 'high', children: ReactNode) => (
    <RenderQualityContext.Provider value={RENDER_QUALITY_CONFIGS[tier]}>
      <WarmupHostContext.Provider value={host}>{children}</WarmupHostContext.Provider>
    </RenderQualityContext.Provider>
  );
  return { hold, release, invalidate, canvas, wrap };
}

const resolvers: Array<(value: WarmupReport) => void> = [];
const inputs: WarmupInput[] = [];

beforeEach(async () => {
  vi.resetModules();
  ({ default: ShaderWarmup } = await import('./ShaderWarmup'));
  ({ RenderQualityContext } = await import('../RenderQualityContext'));
  ({ WarmupHostContext } = await import('./warmupHost'));
  ({ RENDER_QUALITY_CONFIGS } = await import('../renderQuality'));
  inputs.length = 0;
  resolvers.length = 0;
  runner.runShaderWarmup.mockImplementation((input: WarmupInput) => {
    inputs.push(input);
    return new Promise<WarmupReport>(resolve => { resolvers.push(resolve); });
  });
});

afterEach(() => {
  fiber.useThree.mockReset();
  runner.runShaderWarmup.mockReset();
});

describe('ShaderWarmup', () => {
  it('holds the frames, warms the scene, then releases them and asks for the frame that shows the current state', async () => {
    const { hold, release, invalidate, wrap } = setup();
    render(wrap('balanced', <ShaderWarmup />));

    expect(hold).toHaveBeenCalledTimes(1);
    expect(inputs[0].reason).toBe('initial');
    expect(inputs[0].tier).toBe('balanced');
    expect(release).not.toHaveBeenCalled();

    resolvers[0](report());
    await vi.waitFor(() => { expect(release).toHaveBeenCalledTimes(1); });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('compiles the shadow depth fixtures only while shadows are on', () => {
    const { wrap } = setup();
    render(wrap('balanced', <ShaderWarmup />));
    expect(inputs[0].fixtures.map(batch => batch.name)).toEqual(['fixtures:main', 'fixtures:shadow-depth']);
  });

  it('warms again for a tier switch, with its own reason, and cancels the warm-up it replaces', async () => {
    const { hold, release, wrap } = setup();
    const view = render(wrap('balanced', <ShaderWarmup />));
    const first = inputs[0];

    view.rerender(wrap('high', <ShaderWarmup />));

    expect(first.signal.aborted).toBe(true);
    expect(inputs[1].reason).toBe('tier-switch');
    expect(inputs[1].tier).toBe('high');
    expect(inputs[1].resolveTier).toBeDefined();
    expect(hold).toHaveBeenCalledTimes(2);

    // The cancelled run finishing late must not release a hold the newer run still needs.
    resolvers[0](report({ outcome: 'aborted' }));
    await Promise.resolve();
    expect(release).not.toHaveBeenCalled();
    resolvers[1](report({ reason: 'tier-switch', tier: 'high' }));
    await vi.waitFor(() => { expect(release).toHaveBeenCalledTimes(1); });
  });

  it('does not resolve the high tier chain on the other tiers', () => {
    const { wrap } = setup();
    render(wrap('low', <ShaderWarmup />));
    expect(inputs[0].resolveTier).toBeUndefined();
  });

  it('warms again after the context is restored', () => {
    const { canvas, wrap } = setup();
    render(wrap('balanced', <ShaderWarmup />));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    return vi.waitFor(() => {
      expect(inputs).toHaveLength(2);
      expect(inputs[1].reason).toBe('context-restored');
    });
  });

  it('cancels the warm-up when the scene goes away', () => {
    const { wrap } = setup();
    const view = render(wrap('balanced', <ShaderWarmup />));
    view.unmount();
    expect(inputs[0].signal.aborted).toBe(true);
  });
});
