import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { artworkRoot, validateCardArtwork } from './validateCardArtwork.mjs';

test('card artwork validator checks source coverage and built copies', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-card-art-'));
  try {
    const sourceDirectory = path.join(temporaryRoot, 'source');
    const buildDirectory = path.join(temporaryRoot, 'dist');
    await cp(artworkRoot, sourceDirectory, { recursive: true });
    await cp(artworkRoot, path.join(buildDirectory, 'art', 'cards'), { recursive: true });
    assert.equal((await validateCardArtwork({ sourceDirectory, buildDirectory })).errors.length, 0);

    await rm(path.join(sourceDirectory, 'chance', 'chance-dividend.svg'));
    const missing = await validateCardArtwork({ sourceDirectory });
    assert.match(missing.errors.join('\n'), /chance\/chance-dividend\.svg: missing or empty file/);

    await writeFile(
      path.join(sourceDirectory, 'chance', 'chance-dividend.svg'),
      '<svg viewBox="0 0 640 400"><script /></svg>',
      'utf8',
    );
    const unsafe = await validateCardArtwork({ sourceDirectory });
    assert.match(unsafe.errors.join('\n'), /chance\/chance-dividend\.svg: script/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
