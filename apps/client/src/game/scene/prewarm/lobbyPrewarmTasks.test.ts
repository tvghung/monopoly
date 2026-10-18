import { afterEach, describe, expect, it } from 'vitest';
import { DISTRICT_SURFACE_KEYS } from '../board/architecture/tileVisualRegistry';
import { resolveRenderQuality, probeRenderCapabilities } from '../render/renderQuality';
import { createTableTextures, generateTableTextureData } from '../render/table/tableTextures';
import { buildPrewarmTasks } from './lobbyPrewarmTasks';
import {
  districtTextureKey,
  hasProceduralTexture,
  pebbleTextureKey,
  proceduralTextureCacheSize,
  releaseProceduralTextureCache,
  tableTextureKey,
} from './proceduralTextureCache';

afterEach(() => {
  releaseProceduralTextureCache();
});

// Generating the 1024 px table texture is seconds of CPU under the project's vmThreads pool.
const SLOW = { timeout: 60_000 };

describe('buildPrewarmTasks', () => {
  it('has no slices for the low tier', () => {
    expect(buildPrewarmTasks('low')).toEqual([]);
  });

  it('splits the table into bands and adds one slice per district surface and pebble variant, table first', () => {
    const tasks = buildPrewarmTasks('high');
    const names = tasks.map(task => task.name);
    const tableSlices = names.filter(name => name.startsWith('table:'));
    expect(tableSlices.length).toBeGreaterThan(1);
    expect(names.slice(0, tableSlices.length)).toEqual(tableSlices);
    expect(names.filter(name => name.startsWith('district:'))).toHaveLength(DISTRICT_SURFACE_KEYS.length);
    expect(names.filter(name => name.startsWith('pebble:'))).toHaveLength(4);
  });

  it('puts the table into the cache only after its last band, and every other entry after its slice', SLOW, () => {
    const quality = resolveRenderQuality('high', probeRenderCapabilities());
    const key = tableTextureKey(quality.tableTextureSize, quality.tableRoughnessVariation);
    const tasks = buildPrewarmTasks('high');
    const tableTasks = tasks.filter(task => task.name.startsWith('table:'));
    tableTasks.slice(0, -1).forEach(task => task.run());
    expect(hasProceduralTexture(key)).toBe(false);
    tableTasks[tableTasks.length - 1].run();
    expect(hasProceduralTexture(key)).toBe(true);

    const district = tasks.find(task => task.name.startsWith('district:'));
    const pebble = tasks.find(task => task.name.startsWith('pebble:'));
    district?.run();
    pebble?.run();
    expect(hasProceduralTexture(districtTextureKey(district?.name.slice('district:'.length) ?? ''))).toBe(true);
    expect(hasProceduralTexture(pebbleTextureKey(Number(pebble?.name.slice('pebble:'.length))))).toBe(true);
  });

  it('skips what is already prepared', SLOW, () => {
    const first = buildPrewarmTasks('high');
    first.forEach(task => task.run());
    expect(buildPrewarmTasks('high')).toEqual([]);
  });

  it('the prepared table texture is taken once by createTableTextures and is the same bytes as generating it', SLOW, () => {
    const quality = resolveRenderQuality('high', probeRenderCapabilities());
    const options = { roughnessVariation: quality.tableRoughnessVariation };
    buildPrewarmTasks('high').filter(task => task.name.startsWith('table:')).forEach(task => task.run());
    const key = tableTextureKey(quality.tableTextureSize, quality.tableRoughnessVariation);
    expect(hasProceduralTexture(key)).toBe(true);

    const fresh = generateTableTextureData(quality.tableTextureSize, options);
    const prepared = createTableTextures(quality.tableTextureSize, 16, options);
    expect(hasProceduralTexture(key)).toBe(false);
    expect(Buffer.from(prepared.albedo.image.data as Uint8Array).equals(Buffer.from(fresh.albedo))).toBe(true);
    prepared.dispose();

    // A second mount finds nothing left and generates as before.
    const second = createTableTextures(quality.tableTextureSize, 16, options);
    expect(proceduralTextureCacheSize()).toBe(0);
    second.dispose();
  });

  it('createTableTextures with a custom seed leaves the prepared entry alone', SLOW, () => {
    const quality = resolveRenderQuality('high', probeRenderCapabilities());
    buildPrewarmTasks('high').filter(task => task.name.startsWith('table:')).forEach(task => task.run());
    const key = tableTextureKey(quality.tableTextureSize, quality.tableRoughnessVariation);
    const custom = createTableTextures(quality.tableTextureSize, 16, { roughnessVariation: quality.tableRoughnessVariation, seed: 7 });
    expect(hasProceduralTexture(key)).toBe(true);
    custom.dispose();
  });
});
