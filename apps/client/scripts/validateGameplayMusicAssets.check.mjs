import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import {
  MANIFEST_FILE,
  MUSIC_BPM,
  MUSIC_BARS,
  MUSIC_BEATS_PER_BAR,
  MUSIC_SAMPLE_RATE,
  MUSIC_SEGMENT_BOUNDARIES,
  MUSIC_SEGMENT_BARS,
  MUSIC_SEGMENT_COUNT,
  MUSIC_TOTAL_FRAMES,
  STEM_IDS,
  expectedRuntimePaths,
  runtimeSegmentPath,
} from './musicAssetContract.mjs';
import { runCommand } from './musicAudioTools.mjs';
import {
  isExpectedProductionBlock,
  validateGameplayMusicAssets,
} from './validateGameplayMusicAssets.mjs';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

async function hashFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function renderWav(file, { frames = MUSIC_TOTAL_FRAMES } = {}) {
  await runCommand(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000',
    '-af', `atrim=start_sample=0:end_sample=${frames},asetpts=PTS-STARTPTS`,
    '-ar', String(MUSIC_SAMPLE_RATE), '-ac', '2', '-c:a', 'pcm_s16le',
    '-map_metadata', '-1', file,
  ]);
}

async function renderOgg(file, {
  source = 'sine=frequency=220:sample_rate=48000',
  frames = MUSIC_SEGMENT_BOUNDARIES[0].frameCount,
  sampleRate = MUSIC_SAMPLE_RATE,
  channels = 2,
} = {}) {
  await runCommand(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
    '-f', 'lavfi', '-i', source,
    '-af', `atrim=start_sample=0:end_sample=${frames},asetpts=PTS-STARTPTS`,
    '-ar', String(sampleRate), '-ac', String(channels),
    '-c:a', 'libvorbis', '-q:a', '6', '-map_metadata', '-1', file,
  ]);
}

async function encodeStem(sourceFile, stemDirectory) {
  await mkdir(stemDirectory, { recursive: true });
  const labels = MUSIC_SEGMENT_BOUNDARIES.map(segment => `s${segment.index}`);
  const filters = [
    `[0:a]asplit=${MUSIC_SEGMENT_COUNT}${labels.map(label => `[${label}]`).join('')}`,
    ...MUSIC_SEGMENT_BOUNDARIES.map(segment => (
      `[s${segment.index}]atrim=start_sample=${segment.startFrame}:end_sample=${segment.startFrame + segment.frameCount},asetpts=PTS-STARTPTS[o${segment.index}]`
    )),
  ].join(';');
  const outputFiles = MUSIC_SEGMENT_BOUNDARIES.map(segment => (
    path.join(stemDirectory, `${String(segment.index).padStart(2, '0')}.ogg`)
  ));
  const outputArgs = MUSIC_SEGMENT_BOUNDARIES.flatMap((segment, index) => [
    '-map', `[o${segment.index}]`,
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
    '-c:a', 'libvorbis', '-q:a', '6',
    '-ar', String(MUSIC_SAMPLE_RATE), '-ac', '2',
    '-serial_offset', String(segment.index + 1),
    outputFiles[index],
  ]);
  await runCommand(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-bitexact',
    '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1', '-y', '-i', sourceFile,
    '-filter_complex', filters,
    ...outputArgs,
  ]);
}

async function createRuntimeFixture(root) {
  const source = path.join(root, 'fixture.wav');
  const assetDirectory = path.join(root, 'assets');
  const buildDirectory = path.join(root, 'build');
  await renderWav(source);
  await encodeStem(source, path.join(assetDirectory, 'segments', STEM_IDS[0]));
  for (const stemId of STEM_IDS.slice(1)) {
    const target = path.join(assetDirectory, 'segments', stemId);
    await mkdir(target, { recursive: true });
    for (const segment of MUSIC_SEGMENT_BOUNDARIES) {
      await copyFile(
        path.join(assetDirectory, 'segments', STEM_IDS[0], `${String(segment.index).padStart(2, '0')}.ogg`),
        path.join(target, `${String(segment.index).padStart(2, '0')}.ogg`),
      );
    }
  }
  const manifest = {
    schemaVersion: 1,
    track: {
      bpm: MUSIC_BPM,
      beatsPerBar: MUSIC_BEATS_PER_BAR,
      bars: MUSIC_BARS,
      segmentBars: MUSIC_SEGMENT_BARS,
      segmentCount: MUSIC_SEGMENT_COUNT,
      sampleRate: MUSIC_SAMPLE_RATE,
      totalFrames: MUSIC_TOTAL_FRAMES,
    },
    stems: [],
  };
  for (const stemId of STEM_IDS) {
    const segments = [];
    for (const boundary of MUSIC_SEGMENT_BOUNDARIES) {
      const file = runtimeSegmentPath(stemId, boundary.index);
      segments.push({
        index: boundary.index,
        file,
        startFrame: boundary.startFrame,
        frameCount: boundary.frameCount,
        sha256: await hashFile(path.join(assetDirectory, ...file.split('/'))),
      });
    }
    manifest.stems.push({ id: stemId, segments });
  }
  await writeFile(path.join(assetDirectory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const relative of expectedRuntimePaths()) {
    const sourceFile = path.join(assetDirectory, ...relative.split('/'));
    const buildFile = path.join(buildDirectory, ...relative.split('/'));
    await mkdir(path.dirname(buildFile), { recursive: true });
    await copyFile(sourceFile, buildFile);
  }
  return { assetDirectory, buildDirectory };
}

async function copyRuntime(sourceDirectory, targetDirectory) {
  for (const relative of expectedRuntimePaths()) {
    const target = path.join(targetDirectory, ...relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(sourceDirectory, ...relative.split('/')), target);
  }
}

async function readManifest(directory) {
  return JSON.parse(await readFile(path.join(directory, MANIFEST_FILE), 'utf8'));
}

async function writeManifest(directory, manifest) {
  await writeFile(path.join(directory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function assertErrors(directory, matcher, options) {
  const report = await validateGameplayMusicAssets(directory, undefined, options);
  assert.ok(report.errors.some(error => matcher.test(error)), report.errors.join('\n'));
  return report;
}

test('real FFmpeg/ffprobe validation rejects segmented runtime regressions and preserves exact build hashes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-audio-validator-test-'));
  try {
    const fixture = await createRuntimeFixture(root);
    const valid = await validateGameplayMusicAssets(fixture.assetDirectory, fixture.buildDirectory, {
      enforceReleaseGates: false,
    });
    assert.deepEqual(valid.errors, []);
    assert.equal(valid.manifest.schemaVersion, 1);
    assert.equal(valid.stems.length, 4);
    assert.equal(valid.stems.reduce((count, stem) => count + stem.segments.length, 0), 64);
    assert.equal(valid.runtimeLevel3Mix.gains.join(','), '1,0.9,0.8,0.75');
    assert.ok(Number.isFinite(valid.unitySumMix.integratedLufs));
    assert.ok(valid.seams.foundation.some(seam => seam.boundary === '15 → 00'));

    const missingManifest = path.join(root, 'missing-manifest');
    await copyRuntime(fixture.assetDirectory, missingManifest);
    await rm(path.join(missingManifest, MANIFEST_FILE));
    const missingReport = await assertErrors(missingManifest, /missing production manifest/u);
    assert.equal(isExpectedProductionBlock(missingReport), true);

    const badManifest = path.join(root, 'bad-manifest');
    await copyRuntime(fixture.assetDirectory, badManifest);
    const badManifestValue = await readManifest(badManifest);
    badManifestValue.schemaVersion = 2;
    await writeManifest(badManifest, badManifestValue);
    await assertErrors(badManifest, /schemaVersion must be 1/u);

    const missingChunk = path.join(root, 'missing-chunk');
    await copyRuntime(fixture.assetDirectory, missingChunk);
    await rm(path.join(missingChunk, 'segments', 'foundation', '00.ogg'));
    await assertErrors(missingChunk, /required segmented runtime asset missing/u);

    const hashMismatch = path.join(root, 'hash-mismatch');
    await copyRuntime(fixture.assetDirectory, hashMismatch);
    const hashManifest = await readManifest(hashMismatch);
    hashManifest.stems[0].segments[0].sha256 = '0'.repeat(64);
    await writeManifest(hashMismatch, hashManifest);
    await assertErrors(hashMismatch, /SHA-256 does not match manifest/u);

    const corruptChunk = path.join(root, 'corrupt-chunk');
    await copyRuntime(fixture.assetDirectory, corruptChunk);
    await writeFile(path.join(corruptChunk, 'segments', 'foundation', '00.ogg'), 'corrupt');
    await assertErrors(corruptChunk, /SHA-256 does not match manifest/u);

    const wrongCodec = path.join(root, 'wrong-codec');
    await copyRuntime(fixture.assetDirectory, wrongCodec);
    const wrongCodecWav = path.join(root, 'wrong-codec.wav');
    await renderWav(wrongCodecWav, { frames: MUSIC_SEGMENT_BOUNDARIES[0].frameCount });
    await copyFile(wrongCodecWav, path.join(wrongCodec, 'segments', 'foundation', '00.ogg'));
    const wrongCodecManifest = await readManifest(wrongCodec);
    wrongCodecManifest.stems[0].segments[0].sha256 = await hashFile(path.join(wrongCodec, 'segments', 'foundation', '00.ogg'));
    await writeManifest(wrongCodec, wrongCodecManifest);
    await assertErrors(wrongCodec, /expected one OGG\/Vorbis audio stream/u);

    const wrongRate = path.join(root, 'wrong-rate');
    await copyRuntime(fixture.assetDirectory, wrongRate);
    const wrongRateFile = path.join(wrongRate, 'segments', 'foundation', '00.ogg');
    await renderOgg(wrongRateFile, { sampleRate: 44_100 });
    const wrongRateManifest = await readManifest(wrongRate);
    wrongRateManifest.stems[0].segments[0].sha256 = await hashFile(wrongRateFile);
    await writeManifest(wrongRate, wrongRateManifest);
    await assertErrors(wrongRate, /sample rate must be 48000/u);

    const wrongChannels = path.join(root, 'wrong-channels');
    await copyRuntime(fixture.assetDirectory, wrongChannels);
    const wrongChannelsFile = path.join(wrongChannels, 'segments', 'foundation', '00.ogg');
    await renderOgg(wrongChannelsFile, { channels: 1 });
    const wrongChannelsManifest = await readManifest(wrongChannels);
    wrongChannelsManifest.stems[0].segments[0].sha256 = await hashFile(wrongChannelsFile);
    await writeManifest(wrongChannels, wrongChannelsManifest);
    await assertErrors(wrongChannels, /expected stereo/u);

    const wrongFrames = path.join(root, 'wrong-frames');
    await copyRuntime(fixture.assetDirectory, wrongFrames);
    const wrongFramesFile = path.join(wrongFrames, 'segments', 'foundation', '00.ogg');
    await renderOgg(wrongFramesFile, { frames: MUSIC_SEGMENT_BOUNDARIES[0].frameCount - 1_000 });
    const wrongFramesManifest = await readManifest(wrongFrames);
    wrongFramesManifest.stems[0].segments[0].sha256 = await hashFile(wrongFramesFile);
    await writeManifest(wrongFrames, wrongFramesManifest);
    await assertErrors(wrongFrames, /timeline differs from expected|decoded frame count/u);

    const crossStemMismatch = path.join(root, 'cross-stem-mismatch');
    await copyRuntime(fixture.assetDirectory, crossStemMismatch);
    const crossStemManifest = await readManifest(crossStemMismatch);
    crossStemManifest.stems[1].segments[0].startFrame += 1;
    await writeManifest(crossStemMismatch, crossStemManifest);
    await assertErrors(crossStemMismatch, /cumulative frame boundary|cross-stem timeline/u);

    const silentChunk = path.join(root, 'silent-chunk');
    await copyRuntime(fixture.assetDirectory, silentChunk);
    const silentFile = path.join(silentChunk, 'segments', 'foundation', '00.ogg');
    await renderOgg(silentFile, { source: 'anullsrc=sample_rate=48000:channel_layout=stereo' });
    const silentManifest = await readManifest(silentChunk);
    silentManifest.stems[0].segments[0].sha256 = await hashFile(silentFile);
    await writeManifest(silentChunk, silentManifest);
    await assertErrors(silentChunk, /meaningful non-zero decoded audio|silent/u);

    const legacyFile = path.join(root, 'legacy-file');
    await copyRuntime(fixture.assetDirectory, legacyFile);
    await copyFile(
      path.join(legacyFile, 'segments', 'foundation', '00.ogg'),
      path.join(legacyFile, 'gameplay-foundation.ogg'),
    );
    await assertErrors(legacyFile, /obsolete legacy full runtime stem OGG/u);

    const staleChunk = path.join(root, 'stale-chunk');
    await copyRuntime(fixture.assetDirectory, staleChunk);
    await copyFile(
      path.join(staleChunk, 'segments', 'foundation', '00.ogg'),
      path.join(staleChunk, 'segments', 'foundation', '99.ogg'),
    );
    await assertErrors(staleChunk, /unexpected file in canonical runtime music output/u);

    const buildMismatch = path.join(root, 'build-mismatch');
    await copyRuntime(fixture.assetDirectory, buildMismatch);
    await writeFile(path.join(buildMismatch, MANIFEST_FILE), 'wrong build manifest');
    const buildReport = await validateGameplayMusicAssets(fixture.assetDirectory, buildMismatch, {
      enforceReleaseGates: false,
    });
    assert.ok(buildReport.errors.some(error => error.includes('client build output differs')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
