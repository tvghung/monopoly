import type { GraphicsQualitySetting } from '../../../settings/types';
import { DISTRICT_SURFACE_KEYS, getDistrictSurfaceDescriptorByKey } from '../board/architecture/tileVisualRegistry';
import { generateDistrictSurfaceTextureData } from '../board/materials/districtSurfaceMaterials';
import { WHITE_PEBBLE_VARIANTS, generateWhitePebbleTextureData } from '../board/materials/whitePebbleSurface';
import { probeRenderCapabilities, resolveRenderQuality } from '../render/renderQuality';
import { beginTableTexture } from '../render/table/tableTextures';
import {
  districtTextureKey,
  hasProceduralTexture,
  pebbleTextureKey,
  putProceduralTexture,
  tableTextureKey,
} from './proceduralTextureCache';

/**
 * The slices of procedural texture generation (08H Task 1). Kept apart from `lobbyPrewarm.ts` because these modules import three.js
 * and the generators: the scheduler is part of the app's first chunk, this file is loaded only once a prewarm is going to run.
 */
export interface PrewarmTask {
  name: string;
  run: () => void;
}

/** The table texture is rendered in this many bands of rows, so that no slice is much longer than a few tens of milliseconds. */
const TABLE_BANDS = 16;

/** The slices for one graphics tier, in the order the board needs them. Empty for the low tier. */
export function buildPrewarmTasks(graphicsQuality: GraphicsQualitySetting): PrewarmTask[] {
  const quality = resolveRenderQuality(graphicsQuality, probeRenderCapabilities());
  if (quality.tier === 'low') return [];
  const tasks: PrewarmTask[] = [];

  const size = quality.tableTextureSize;
  const tableKey = tableTextureKey(size, quality.tableRoughnessVariation);
  if (!hasProceduralTexture(tableKey)) {
    const build = beginTableTexture(size, { roughnessVariation: quality.tableRoughnessVariation });
    const rowsPerBand = Math.ceil(size / TABLE_BANDS);
    for (let from = 0; from < size; from += rowsPerBand) {
      const to = Math.min(size, from + rowsPerBand);
      tasks.push({
        name: `table:${from}`,
        run: () => {
          build.renderRows(from, to);
          if (to === size) putProceduralTexture(tableKey, build.data);
        },
      });
    }
  }
  for (const surfaceKey of DISTRICT_SURFACE_KEYS) {
    if (hasProceduralTexture(districtTextureKey(surfaceKey))) continue;
    tasks.push({
      name: `district:${surfaceKey}`,
      run: () => putProceduralTexture(
        districtTextureKey(surfaceKey),
        generateDistrictSurfaceTextureData(getDistrictSurfaceDescriptorByKey(surfaceKey)),
      ),
    });
  }
  for (const variant of WHITE_PEBBLE_VARIANTS) {
    if (hasProceduralTexture(pebbleTextureKey(variant))) continue;
    tasks.push({
      name: `pebble:${variant}`,
      run: () => putProceduralTexture(pebbleTextureKey(variant), generateWhitePebbleTextureData(variant)),
    });
  }
  return tasks;
}
