import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => ({
  useThree: vi.fn(),
  loadBaked: vi.fn(),
  createStudio: vi.fn(),
  disposeStudio: vi.fn(),
  diagnosticsEnabled: vi.fn(),
  markScene: vi.fn(),
  pmremGenerator: vi.fn(),
}));

vi.mock('@react-three/fiber', async importOriginal => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  useThree: doubles.useThree,
}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, PMREMGenerator: doubles.pmremGenerator };
});
vi.mock('./bakedStudioEnvironment', () => ({
  BAKED_STUDIO_HEIGHT: 1024,
  BAKED_STUDIO_WIDTH: 768,
  STUDIO_PMREM_SIGMA: 0.04,
  loadBakedStudioEnvironment: doubles.loadBaked,
  studioEnvironmentInputsHash: () => 'fixture',
}));
vi.mock('./createStudioEnvironmentScene', () => ({
  createStudioEnvironmentScene: doubles.createStudio,
  disposeStudioEnvironmentScene: doubles.disposeStudio,
}));
vi.mock('../diagnostics/localDiagnostics', () => ({
  isLocalDiagnosticsEnabled: doubles.diagnosticsEnabled,
}));
vi.mock('../warmup/sceneMarks', () => ({
  markSceneOnce: doubles.markScene,
}));

import { RenderQualityContext } from '../RenderQualityContext';
import { RENDER_QUALITY_CONFIGS } from '../renderQuality';
import { NO_WARMUP_HOST, WarmupHostContext } from '../warmup/warmupHost';
import StudioEnvironment from './StudioEnvironment';

let scene: THREE.Scene;
let gl: THREE.WebGLRenderer;
let invalidate: ReturnType<typeof vi.fn>;
let warmup: typeof NO_WARMUP_HOST;
let markEnvironmentSettled: ReturnType<typeof vi.fn<() => void>>;

function mountEnvironment() {
  doubles.useThree
    .mockReturnValueOnce(gl)
    .mockReturnValueOnce(scene)
    .mockReturnValueOnce(invalidate);
  return render(
    <RenderQualityContext.Provider value={RENDER_QUALITY_CONFIGS.high}>
      <WarmupHostContext.Provider value={warmup}>
        <StudioEnvironment />
      </WarmupHostContext.Provider>
    </RenderQualityContext.Provider>,
  );
}

async function settleEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function configureGenerator(fromScene: () => THREE.WebGLRenderTarget) {
  const generator = {
    fromScene: vi.fn(fromScene),
    dispose: vi.fn(),
  };
  doubles.pmremGenerator.mockImplementation(function () { return generator; });
  return generator;
}

beforeEach(() => {
  scene = new THREE.Scene();
  gl = {} as THREE.WebGLRenderer;
  invalidate = vi.fn();
  markEnvironmentSettled = vi.fn<() => void>();
  warmup = { ...NO_WARMUP_HOST, markEnvironmentSettled };
  doubles.useThree.mockReset();
  doubles.loadBaked.mockReset().mockResolvedValue(null);
  doubles.createStudio.mockReset();
  doubles.disposeStudio.mockReset();
  doubles.diagnosticsEnabled.mockReset().mockReturnValue(false);
  doubles.markScene.mockReset();
  doubles.pmremGenerator.mockReset();
  doubles.createStudio.mockReturnValue(new THREE.Scene());
});

afterEach(() => {
  cleanup();
  if (scene) {
    scene.environment = null;
    scene.environmentIntensity = 1;
  }
  vi.restoreAllMocks();
});

describe('StudioEnvironment resource ownership', () => {
  it('keeps a generated target valid while mounted and releases its owned resources once on teardown', async () => {
    const studio = new THREE.Scene();
    const texture = new THREE.Texture();
    const textureDispose = vi.spyOn(texture, 'dispose');
    const targetDispose = vi.fn(() => texture.dispose());
    const target = {
      texture,
      dispose: targetDispose,
    } as unknown as THREE.WebGLRenderTarget;
    const generator = configureGenerator(() => target);
    doubles.createStudio.mockReturnValue(studio);

    const view = mountEnvironment();
    await settleEffects();

    expect(generator.fromScene).toHaveBeenCalledWith(studio, 0.04);
    expect(scene.environment).toBe(texture);
    expect(generator.dispose).not.toHaveBeenCalled();
    expect(targetDispose).not.toHaveBeenCalled();
    expect(doubles.disposeStudio).not.toHaveBeenCalled();
    expect(markEnvironmentSettled).toHaveBeenCalledTimes(1);

    view.unmount();

    expect(targetDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(doubles.disposeStudio).toHaveBeenCalledTimes(1);
    expect(doubles.disposeStudio).toHaveBeenCalledWith(studio);
    expect(generator.dispose).toHaveBeenCalledTimes(1);
    expect(scene.environment).toBeNull();
  });

  it('disposes the generator when studio creation fails before a target exists', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const generator = configureGenerator(() => {
      throw new Error('fromScene should not run');
    });
    doubles.createStudio.mockImplementation(() => {
      throw new Error('studio allocation failed');
    });

    const view = mountEnvironment();
    await settleEffects();

    expect(generator.fromScene).not.toHaveBeenCalled();
    expect(generator.dispose).toHaveBeenCalledTimes(1);
    expect(doubles.disposeStudio).not.toHaveBeenCalled();
    expect(scene.environment).toBeNull();
    expect(markEnvironmentSettled).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(generator.dispose).toHaveBeenCalledTimes(1);
  });

  it('releases the generator and owned studio when PMREM generation fails after allocation', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const studio = new THREE.Scene();
    const abandonedTargetDispose = vi.fn();
    const abandonedTarget = {
      texture: new THREE.Texture(),
      dispose: abandonedTargetDispose,
    } as unknown as THREE.WebGLRenderTarget;
    const generator = configureGenerator(() => {
      (generator as unknown as { _allocateTargets: () => THREE.WebGLRenderTarget })._allocateTargets();
      throw new Error('PMREM generation failed');
    });
    const allocateTargets = vi.fn(() => abandonedTarget);
    Object.assign(generator, { _allocateTargets: allocateTargets });
    doubles.createStudio.mockReturnValue(studio);

    const view = mountEnvironment();
    await settleEffects();

    expect(generator.fromScene).toHaveBeenCalledTimes(1);
    expect(allocateTargets).toHaveBeenCalledTimes(1);
    expect(abandonedTargetDispose).toHaveBeenCalledTimes(1);
    expect(generator.dispose).toHaveBeenCalledTimes(1);
    expect(doubles.disposeStudio).toHaveBeenCalledTimes(1);
    expect(doubles.disposeStudio).toHaveBeenCalledWith(studio);
    expect(scene.environment).toBeNull();
    expect(markEnvironmentSettled).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(generator.dispose).toHaveBeenCalledTimes(1);
    expect(doubles.disposeStudio).toHaveBeenCalledTimes(1);
  });

  it('supports repeated failure and retry cycles without retaining a previous generator', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failedGenerators = [configureGenerator(() => { throw new Error('first failure'); })];
    const failedStudio = new THREE.Scene();
    doubles.createStudio.mockReturnValue(failedStudio);

    const first = mountEnvironment();
    await settleEffects();
    first.unmount();

    const secondGenerator = configureGenerator(() => { throw new Error('second failure'); });
    const secondStudio = new THREE.Scene();
    doubles.createStudio.mockReturnValue(secondStudio);
    const second = mountEnvironment();
    await settleEffects();
    second.unmount();

    const texture = new THREE.Texture();
    const targetDispose = vi.fn();
    const target = { texture, dispose: targetDispose } as unknown as THREE.WebGLRenderTarget;
    const recoveredGenerator = configureGenerator(() => target);
    const recoveredStudio = new THREE.Scene();
    doubles.createStudio.mockReturnValue(recoveredStudio);
    const recovered = mountEnvironment();
    await settleEffects();

    expect(failedGenerators[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(secondGenerator.dispose).toHaveBeenCalledTimes(1);
    expect(doubles.disposeStudio).toHaveBeenCalledWith(failedStudio);
    expect(doubles.disposeStudio).toHaveBeenCalledWith(secondStudio);
    expect(recoveredGenerator.dispose).not.toHaveBeenCalled();
    expect(scene.environment).toBe(texture);

    recovered.unmount();

    expect(recoveredGenerator.dispose).toHaveBeenCalledTimes(1);
    expect(targetDispose).toHaveBeenCalledTimes(1);
    expect(doubles.disposeStudio).toHaveBeenCalledWith(recoveredStudio);
  });

  it('keeps a baked source texture alive until its scene owner unmounts', async () => {
    const texture = new THREE.Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    doubles.loadBaked.mockResolvedValue(texture);

    const view = mountEnvironment();
    await settleEffects();

    expect(scene.environment).toBe(texture);
    expect(doubles.pmremGenerator).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();

    view.unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scene.environment).toBeNull();
  });

  it('disposes a late baked result after unmount without applying it', async () => {
    let resolveBaked!: (texture: THREE.Texture | null) => void;
    doubles.loadBaked.mockReturnValue(new Promise(resolve => { resolveBaked = resolve; }));
    const texture = new THREE.Texture();
    const dispose = vi.spyOn(texture, 'dispose');

    const view = mountEnvironment();
    await settleEffects();
    view.unmount();

    await act(async () => {
      resolveBaked(texture);
      await Promise.resolve();
    });

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scene.environment).toBeNull();
    expect(doubles.pmremGenerator).not.toHaveBeenCalled();
  });
});
