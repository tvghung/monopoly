import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { landmarkArtworkRoot, streetTileIds, validateLandmarkArtwork } from './validateLandmarkArtwork.mjs';

test('the landmark artwork set is one picture per street tile of the board', async () => {
  const ids = await streetTileIds();
  assert.equal(ids.length, 22);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  assert.equal((await validateLandmarkArtwork()).errors.length, 0);
});

test('landmark artwork validator checks coverage, safety, orphans and built copies', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-landmark-art-'));
  try {
    const sourceDirectory = path.join(temporaryRoot, 'source');
    const buildDirectory = path.join(temporaryRoot, 'dist');
    await cp(landmarkArtworkRoot, sourceDirectory, { recursive: true });
    await cp(landmarkArtworkRoot, path.join(buildDirectory, 'art', 'landmarks'), { recursive: true });
    assert.equal((await validateLandmarkArtwork({ sourceDirectory, buildDirectory })).errors.length, 0);

    await rm(path.join(sourceDirectory, '13.svg'));
    const missing = await validateLandmarkArtwork({ sourceDirectory });
    assert.match(missing.errors.join('\n'), /13\.svg: missing or empty file/);

    await writeFile(path.join(sourceDirectory, '13.svg'), '<svg viewBox="0 0 160 160"><script /></svg>', 'utf8');
    const unsafe = await validateLandmarkArtwork({ sourceDirectory });
    assert.match(unsafe.errors.join('\n'), /13\.svg: script/);

    await writeFile(path.join(sourceDirectory, '13.svg'), '<svg viewBox="0 0 640 400"><rect width="1" height="1"/></svg>', 'utf8');
    const wrongBox = await validateLandmarkArtwork({ sourceDirectory });
    assert.match(wrongBox.errors.join('\n'), /13\.svg: viewBox must be exactly 0 0 160 160/);

    for (const [name, body] of [
      ['text', '<svg viewBox="0 0 160 160"><text>Chùa Cầu</text></svg>'],
      ['image', '<svg viewBox="0 0 160 160"><image/></svg>'],
      ['href', '<svg viewBox="0 0 160 160"><use href="#a"/></svg>'],
      ['external', '<svg viewBox="0 0 160 160"><rect fill="url(https://example.com/a.svg)"/></svg>'],
    ]) {
      await writeFile(path.join(sourceDirectory, '13.svg'), body, 'utf8');
      assert.notEqual((await validateLandmarkArtwork({ sourceDirectory })).errors.length, 0, name);
    }

    await cp(path.join(landmarkArtworkRoot, '13.svg'), path.join(sourceDirectory, '13.svg'));
    await writeFile(path.join(sourceDirectory, '99.svg'), '<svg viewBox="0 0 160 160"><rect width="1" height="1"/></svg>', 'utf8');
    assert.match((await validateLandmarkArtwork({ sourceDirectory })).errors.join('\n'), /99\.svg: orphan artwork file/);
    await rm(path.join(sourceDirectory, '99.svg'));

    await writeFile(
      path.join(buildDirectory, 'art', 'landmarks', '24.svg'),
      '<svg viewBox="0 0 160 160"><rect width="2" height="2"/></svg>',
      'utf8',
    );
    const stale = await validateLandmarkArtwork({ sourceDirectory, buildDirectory });
    assert.match(stale.errors.join('\n'), /24\.svg: build output differs from source artwork/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
