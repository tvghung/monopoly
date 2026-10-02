import { describe, expect, it } from 'vitest';
import {
  GRAPHICS_QUALITY_SETTINGS,
  RENDER_QUALITY_CONFIGS,
  probeRenderCapabilities,
  resolveAutoTier,
  resolveRenderQuality,
  resolveRenderTier,
  type RenderCapabilityProbe,
} from './renderQuality';

const desktop: RenderCapabilityProbe = {
  coarsePointer: false,
  hoverNone: false,
  longestScreenSide: 1920,
  maxTextureSize: 16384,
  hardwareConcurrency: 8,
};

describe('auto tier', () => {
  it('resolves a capable desktop to balanced and never to high', () => {
    expect(resolveAutoTier(desktop)).toBe('balanced');
    expect(resolveAutoTier({ ...desktop, hardwareConcurrency: 32, maxTextureSize: 32768 })).toBe('balanced');
  });

  it.each([
    ['a small touch screen', { coarsePointer: true, longestScreenSide: 812 }],
    ['a touch-first mobile profile', { coarsePointer: true, hoverNone: true, longestScreenSide: 1366 }],
    ['a weak texture limit', { maxTextureSize: 4096 }],
    ['four or fewer logical cores', { hardwareConcurrency: 4 }],
    ['unknown cores (reported as 1)', { hardwareConcurrency: 1 }],
  ] as const)('resolves %s to low', (_label, overrides) => {
    expect(resolveAutoTier({ ...desktop, ...overrides })).toBe('low');
  });

  it('keeps a large touch screen with a mouse-capable profile on balanced', () => {
    expect(resolveAutoTier({ ...desktop, coarsePointer: true, longestScreenSide: 1366 })).toBe('balanced');
  });
});

describe('explicit settings', () => {
  it.each(['high', 'balanced', 'low'] as const)('%s wins over the device probe', setting => {
    expect(resolveRenderTier(setting, { ...desktop, hardwareConcurrency: 2 })).toBe(setting);
    expect(resolveRenderQuality(setting, desktop)).toBe(RENDER_QUALITY_CONFIGS[setting]);
  });

  it('falls back to auto for invalid values', () => {
    for (const value of ['ultra', '', null, undefined, 3, {}]) {
      expect(resolveRenderTier(value, desktop)).toBe('balanced');
      expect(resolveRenderTier(value, { ...desktop, hardwareConcurrency: 2 })).toBe('low');
    }
  });

  it('lists the four settings the Settings panel offers', () => {
    expect([...GRAPHICS_QUALITY_SETTINGS]).toEqual(['auto', 'high', 'balanced', 'low']);
  });
});

describe('tier table (plan 02 §8.8)', () => {
  it('raises dpr, shadows and effects from low to high', () => {
    const { low, balanced, high } = RENDER_QUALITY_CONFIGS;
    expect(low.dpr).toEqual([1, 1.25]);
    expect(balanced.dpr).toEqual([1.25, 1.5]);
    expect(high.dpr).toEqual([1.25, 2]);
    expect([low, balanced, high].map(config => config.shadows.mapSize)).toEqual([0, 1024, 2048]);
    expect([low, balanced, high].map(config => config.shadows.enabled)).toEqual([false, true, true]);
    expect([low, balanced, high].map(config => config.postProcessing)).toEqual([false, false, true]);
    expect([low, balanced, high].map(config => config.environmentIntensity)).toEqual([0.6, 0.7, 0.8]);
  });

  it('keeps blob shadows under buildings only while real shadows are off', () => {
    for (const config of Object.values(RENDER_QUALITY_CONFIGS)) {
      expect(config.buildingContactShadows).toBe(!config.shadows.enabled);
    }
  });

  it('turns the DOM paper grain off in the low tier only and keeps the table texture sizes', () => {
    expect(RENDER_QUALITY_CONFIGS.low.paperGrain).toBe(false);
    expect(RENDER_QUALITY_CONFIGS.balanced.paperGrain).toBe(true);
    expect(RENDER_QUALITY_CONFIGS.high.paperGrain).toBe(true);
    expect(RENDER_QUALITY_CONFIGS.low.tableTextureSize).toBe(512);
    expect(RENDER_QUALITY_CONFIGS.balanced.tableTextureSize).toBe(1024);
    expect(RENDER_QUALITY_CONFIGS.high.tableRoughnessVariation).toBe(true);
  });

  it('applies Neutral tone mapping in the post chain only for high', () => {
    expect(RENDER_QUALITY_CONFIGS.high.toneMappingInPost).toBe(true);
    expect(RENDER_QUALITY_CONFIGS.balanced.toneMappingInPost).toBe(false);
    expect(RENDER_QUALITY_CONFIGS.low.toneMappingInPost).toBe(false);
  });
});

describe('probeRenderCapabilities', () => {
  const environment = (coarse: boolean, hoverNone: boolean) => ({
    matchMedia: (query: string) => ({
      matches: (query.includes('pointer: coarse') && coarse) || (query.includes('hover: none') && hoverNone),
    }),
    screen: { width: 1080, height: 2400 },
    navigator: { hardwareConcurrency: 8 },
  });

  it('reads pointer, hover, screen, cores and the renderer texture limit', () => {
    expect(probeRenderCapabilities({ capabilities: { maxTextureSize: 16384 } }, environment(true, true))).toEqual({
      coarsePointer: true,
      hoverNone: true,
      longestScreenSide: 2400,
      maxTextureSize: 16384,
      hardwareConcurrency: 8,
    });
  });

  it('treats missing environment data as a weak device', () => {
    const probe = probeRenderCapabilities({ capabilities: { maxTextureSize: 16384 } }, {});

    expect(probe).toMatchObject({ coarsePointer: false, hoverNone: false, longestScreenSide: 0, hardwareConcurrency: 1 });
    expect(resolveAutoTier(probe)).toBe('low');
  });
});
