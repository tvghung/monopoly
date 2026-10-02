import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArtworkCli, validateArtworkSet } from './artworkValidation.mjs';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LANDMARK_ARTWORK_ROOT = 'art/landmarks';
export const landmarkArtworkRoot = path.join(clientRoot, 'public', LANDMARK_ARTWORK_ROOT);
export const LANDMARK_ARTWORK_VIEW_BOX = '0 0 160 160';

const tileStateSource = path.join(clientRoot, '..', '..', 'packages', 'shared', 'src', 'tileState.ts');

/** The street tiles of the board: the tile ids listed in the shared `colorGroups`, ascending. Each owns one landmark picture. */
export async function streetTileIds() {
  const source = await readFile(tileStateSource, 'utf8');
  const block = source.match(/export const colorGroups[^=]*=\s*\{([\s\S]*?)\};/u);
  if (!block) throw new Error('colorGroups was not found in packages/shared/src/tileState.ts');
  const ids = [...block[1].matchAll(/\[([^\]]*)\]/gu)]
    .flatMap(match => match[1].split(',').map(value => Number(value.trim())))
    .filter(Number.isInteger);
  return [...new Set(ids)].sort((a, b) => a - b);
}

async function expectedFiles() {
  return (await streetTileIds()).map(tileId => ({ tileId, relative: `${tileId}.svg` }));
}

export async function validateLandmarkArtwork({
  sourceDirectory = landmarkArtworkRoot,
  buildDirectory,
} = {}) {
  return validateArtworkSet({
    expected: await expectedFiles(),
    sourceDirectory,
    buildDirectory,
    buildRoot: LANDMARK_ARTWORK_ROOT,
    viewBox: LANDMARK_ARTWORK_VIEW_BOX,
  });
}

await runArtworkCli({
  scriptUrl: import.meta.url,
  scriptName: 'validateLandmarkArtwork.mjs',
  label: 'landmark artworks',
  clientRoot,
  validate: validateLandmarkArtwork,
});
