import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import {
  MUSIC_SAMPLE_RATE,
  MUSIC_TOTAL_FRAMES,
  SOURCE_MASTER_FILES,
  expectedRuntimePaths,
} from './musicAssetContract.mjs';
import { runCommand } from './musicAudioTools.mjs';
import {
  generateGameplayMusicSegments,
  validateSourceMasters,
} from './generateGameplayMusicSegments.mjs';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

async function listFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, file));
    else files.push(path.relative(root, file).split(path.sep).join('/'));
  }
  return files;
}

async function hashFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function runtimeHashes(directory) {
  const hashes = new Map();
  for (const relative of expectedRuntimePaths()) hashes.set(relative, await hashFile(path.join(directory, ...relative.split('/'))));
  return hashes;
}

async function renderWav(file, {
  source = 'sine=frequency=220:sample_rate=48000',
  frames = MUSIC_TOTAL_FRAMES,
  sampleRate = MUSIC_SAMPLE_RATE,
  channels = 2,
} = {}) {
  await runCommand(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
    '-f', 'lavfi', '-i', source,
    '-frames:a', String(frames),
    '-ar', String(sampleRate), '-ac', String(channels),
    '-c:a', 'pcm_s16le', '-map_metadata', '-1', file,
  ]);
}

async function createValidSources(directory) {
  await mkdir(directory, { recursive: true });
  const first = path.join(directory, SOURCE_MASTER_FILES[0]);
  await renderWav(first);
  for (const fileName of SOURCE_MASTER_FILES.slice(1)) await copyFile(first, path.join(directory, fileName));
}

async function copySources(sourceDirectory, targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
  for (const fileName of SOURCE_MASTER_FILES) await copyFile(
    path.join(sourceDirectory, fileName),
    path.join(targetDirectory, fileName),
  );
}

test('production music generation validates source masters and promotes deterministic segmented output atomically', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-music-pipeline-test-'));
  const sourceDirectory = path.join(root, 'source');
  const outputDirectory = path.join(root, 'output');
  const reportPath = path.join(root, 'generation-report.json');
  try {
    await createValidSources(sourceDirectory);
    const firstReport = await generateGameplayMusicSegments({ sourceDirectory, outputDirectory, reportPath });
    assert.equal(firstReport.runtime.errors.length, 0);
    assert.equal(firstReport.sourceMasters.length, 4);
    assert.deepEqual((await listFiles(outputDirectory)).sort(), expectedRuntimePaths().sort());
    assert.equal(JSON.parse(await readFile(reportPath, 'utf8')).schemaVersion, 1);
    const manifest = JSON.parse(await readFile(path.join(outputDirectory, 'gameplay-music.manifest.json'), 'utf8'));
    assert.equal(manifest.track.totalFrames, MUSIC_TOTAL_FRAMES);
    assert.equal(manifest.stems.length, 4);
    assert.equal(manifest.stems.reduce((count, stem) => count + stem.segments.length, 0), 64);
    assert.ok(manifest.stems.every(stem => stem.segments.every(segment => /^[a-f0-9]{64}$/u.test(segment.sha256))));
    const firstHashes = await runtimeHashes(outputDirectory);

    await mkdir(path.join(outputDirectory, 'segments', 'foundation'), { recursive: true });
    await writeFile(path.join(outputDirectory, 'segments', 'foundation', '99.ogg'), 'stale');
    await writeFile(path.join(outputDirectory, 'gameplay-foundation.ogg'), 'legacy');
    await generateGameplayMusicSegments({ sourceDirectory, outputDirectory });
    assert.deepEqual(await runtimeHashes(outputDirectory), firstHashes);
    assert.deepEqual((await listFiles(outputDirectory)).sort(), expectedRuntimePaths().sort());

    const manifestBeforeFailure = await readFile(path.join(outputDirectory, 'gameplay-music.manifest.json'));
    await writeFile(path.join(sourceDirectory, SOURCE_MASTER_FILES[1]), 'corrupt source');
    await assert.rejects(
      generateGameplayMusicSegments({ sourceDirectory, outputDirectory }),
      /lossless PCM WAV|Invalid data|ffprobe/u,
    );
    assert.deepEqual(await readFile(path.join(outputDirectory, 'gameplay-music.manifest.json')), manifestBeforeFailure);
    await copyFile(
      path.join(sourceDirectory, SOURCE_MASTER_FILES[0]),
      path.join(sourceDirectory, SOURCE_MASTER_FILES[1]),
    );

    const invalidCases = [
      {
        name: 'corrupt',
        mutate: async directory => writeFile(path.join(directory, SOURCE_MASTER_FILES[3]), 'not a wav'),
        message: /lossless PCM WAV|Invalid data|ffprobe/u,
      },
      {
        name: 'wrong-channel-count',
        mutate: directory => renderWav(path.join(directory, SOURCE_MASTER_FILES[1]), {
          frames: 1_000,
          channels: 1,
        }),
        message: /source must be stereo/u,
      },
      {
        name: 'wrong-sample-rate',
        mutate: directory => renderWav(path.join(directory, SOURCE_MASTER_FILES[1]), {
          frames: 1_000,
          sampleRate: 44_100,
        }),
        message: /source sample rate/u,
      },
      {
        name: 'wrong-frame-count',
        mutate: directory => renderWav(path.join(directory, SOURCE_MASTER_FILES[1]), { frames: 1_000 }),
        message: /source must contain/u,
      },
      {
        name: 'silent',
        mutate: async directory => {
          const bytes = await readFile(path.join(sourceDirectory, SOURCE_MASTER_FILES[0]));
          bytes.fill(0, 44);
          await writeFile(path.join(directory, SOURCE_MASTER_FILES[1]), bytes);
        },
        message: /meaningfully silent/u,
      },
    ];
    for (const invalidCase of invalidCases) {
      const directory = path.join(root, `invalid-${invalidCase.name}`);
      await copySources(sourceDirectory, directory);
      await invalidCase.mutate(directory);
      await assert.rejects(
        validateSourceMasters({ sourceDirectory: directory }),
        invalidCase.message,
        invalidCase.name,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
