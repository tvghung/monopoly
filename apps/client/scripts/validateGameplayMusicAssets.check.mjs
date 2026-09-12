import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assetRoot,
  EXPECTED_AUDIO_ASSETS,
  MUSIC_ASSET_PATH,
  validateGameplayMusicAssets,
} from './validateGameplayMusicAssets.mjs';

async function copyAssets(target) {
  for (const relative of EXPECTED_AUDIO_ASSETS) {
    const destination = path.join(target, ...relative.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(assetRoot, ...relative.split('/')), destination);
  }
}

test('audio validator checks the exact runtime set and build hashes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-audio-validator-'));
  try {
    const build = path.join(root, 'build');
    await copyAssets(root);
    await copyAssets(build);
    const valid = await validateGameplayMusicAssets(root, build);
    assert.deepEqual(valid.errors, []);
    assert.equal(valid.music.path, MUSIC_ASSET_PATH);
    assert.equal(valid.sfx.length, EXPECTED_AUDIO_ASSETS.length - 1);

    const musicOutput = path.join(build, ...MUSIC_ASSET_PATH.split('/'));
    await writeFile(musicOutput, (await readFile(musicOutput)).subarray(0, 32));
    const mismatch = await validateGameplayMusicAssets(root, build);
    assert.ok(mismatch.errors.some(error => error.includes('build output differs')));

    const missing = path.join(root, 'missing');
    await mkdir(missing, { recursive: true });
    const missingReport = await validateGameplayMusicAssets(missing);
    assert.ok(missingReport.errors.some(error => error.startsWith(`${MUSIC_ASSET_PATH}:`)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
