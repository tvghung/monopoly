import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArtworkCli, validateArtworkSet } from './artworkValidation.mjs';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CARD_ARTWORK_ROOT = 'art/cards';
export const artworkRoot = path.join(clientRoot, 'public', CARD_ARTWORK_ROOT);

const deckSources = [
  ['chance', path.join(clientRoot, '..', '..', 'packages', 'shared', 'src', 'chanceCards.ts')],
  ['chest', path.join(clientRoot, '..', '..', 'packages', 'shared', 'src', 'chestCards.ts')],
];

async function expectedFiles() {
  const result = [];
  for (const [deck, sourcePath] of deckSources) {
    const source = await readFile(sourcePath, 'utf8');
    for (const match of source.matchAll(/\bid:\s*['"]([^'"]+)['"]/gu)) {
      result.push({ deck, id: match[1], relative: `${deck}/${match[1]}.svg` });
    }
  }
  return result;
}

export async function validateCardArtwork({
  sourceDirectory = artworkRoot,
  buildDirectory,
} = {}) {
  return validateArtworkSet({
    expected: await expectedFiles(),
    sourceDirectory,
    buildDirectory,
    buildRoot: CARD_ARTWORK_ROOT,
    viewBox: '0 0 640 400',
  });
}

await runArtworkCli({
  scriptUrl: import.meta.url,
  scriptName: 'validateCardArtwork.mjs',
  label: 'card artworks',
  clientRoot,
  validate: validateCardArtwork,
});
