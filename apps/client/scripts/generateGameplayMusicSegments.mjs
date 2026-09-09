import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_RUNTIME_FILES,
  MANIFEST_FILE,
  MUSIC_BPM,
  MUSIC_BARS,
  MUSIC_BEATS_PER_BAR,
  MUSIC_SAMPLE_RATE,
  MUSIC_SEGMENT_BOUNDARIES,
  MUSIC_SEGMENT_COUNT,
  MUSIC_SEGMENT_BARS,
  MUSIC_TOTAL_FRAMES,
  SOURCE_MASTER_FILES,
  STEM_IDS,
  runtimeSegmentPath,
} from './musicAssetContract.mjs';
import { decodedPcmArgs, measurePcm, probeAudio, runCommand } from './musicAudioTools.mjs';
import { validateGameplayMusicAssets } from './validateGameplayMusicAssets.mjs';
import { createHash } from 'node:crypto';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(clientRoot, '../..');
export const defaultSourceDirectory = path.join(repositoryRoot, 'audio-source', 'gameplay');
export const defaultOutputDirectory = path.join(clientRoot, 'public', 'audio', 'music', 'gameplay');
const encodingQuality = '6';
const minimumAudioPeak = 0.00001;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function hashFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

function assertSourceAndOutputAreSeparate(sourceDirectory, outputDirectory) {
  const relative = path.relative(sourceDirectory, outputDirectory);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Source masters and runtime output must use separate directories');
  }
}

async function validateSource(file, ffmpeg, ffprobe) {
  const info = await probeAudio(ffprobe, file);
  const stream = info.streams?.find(candidate => candidate.codec_type === 'audio');
  if (info.format?.format_name !== 'wav' || info.streams?.length !== 1
    || stream?.codec_type !== 'audio' || !stream.codec_name?.startsWith('pcm_')) {
    throw new Error('source must be a lossless PCM WAV with one audio stream');
  }
  if (stream.channels !== 2) throw new Error(`source must be stereo; received ${String(stream.channels)} channels`);
  if (Number(stream.sample_rate) !== MUSIC_SAMPLE_RATE) {
    throw new Error(`source sample rate must be ${MUSIC_SAMPLE_RATE} Hz; received ${String(stream.sample_rate)}`);
  }
  const decoded = await measurePcm(ffmpeg, decodedPcmArgs(['-i', file]), { sampleRate: MUSIC_SAMPLE_RATE });
  if (Math.abs(decoded.decodedFrames - MUSIC_TOTAL_FRAMES) > 1) {
    throw new Error(`source must contain ${MUSIC_TOTAL_FRAMES} frames; received ${decoded.decodedFrames}`);
  }
  if (decoded.samplePeak <= minimumAudioPeak) throw new Error('source is meaningfully silent');
  if (decoded.samplePeak >= 1) throw new Error('source PCM clips at full scale');
  return {
    file,
    format: info.format.format_name,
    codec: stream.codec_name,
    channels: stream.channels,
    sampleRate: Number(stream.sample_rate),
    decodedFrames: decoded.decodedFrames,
    samplePeak: decoded.samplePeak,
  };
}

export async function validateSourceMasters({
  sourceDirectory = defaultSourceDirectory,
  ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath = process.env.FFPROBE_PATH || 'ffprobe',
} = {}) {
  const masters = [];
  for (const fileName of SOURCE_MASTER_FILES) {
    const file = path.join(sourceDirectory, fileName);
    try {
      masters.push(await validateSource(file, ffmpegPath, ffprobePath));
    } catch (error) {
      throw new Error(`${fileName}: ${errorMessage(error)}`, { cause: error });
    }
  }
  const frameCounts = new Set(masters.map(master => master.decodedFrames));
  if (frameCounts.size !== 1) throw new Error('all source masters must have the same decoded frame count');
  return masters;
}

async function encodeStem(sourceFile, stemId, stageDirectory, ffmpeg) {
  const labels = MUSIC_SEGMENT_BOUNDARIES.map(segment => `s${segment.index}`);
  const filters = [
    `[0:a]asplit=${MUSIC_SEGMENT_COUNT}${labels.map(label => `[${label}]`).join('')}`,
    ...MUSIC_SEGMENT_BOUNDARIES.map(segment => (
      `[s${segment.index}]atrim=start_sample=${segment.startFrame}:end_sample=${segment.startFrame + segment.frameCount},asetpts=PTS-STARTPTS[o${segment.index}]`
    )),
  ].join(';');
  const outputFiles = MUSIC_SEGMENT_BOUNDARIES.map(segment => (
    path.join(stageDirectory, ...runtimeSegmentPath(stemId, segment.index).split('/'))
  ));
  const outputArgs = MUSIC_SEGMENT_BOUNDARIES.flatMap((segment, index) => [
    '-map', `[o${index}]`,
    '-map_metadata', '-1',
    '-c:a', 'libvorbis', '-q:a', encodingQuality,
    '-ar', String(MUSIC_SAMPLE_RATE), '-ac', '2',
    '-serial_offset', String(segment.index + 1),
    outputFiles[index],
  ]);
  await runCommand(ffmpeg, [
    '-hide_banner', '-nostdin', '-xerror', '-bitexact', '-threads', '1',
    '-filter_threads', '1', '-filter_complex_threads', '1', '-y',
    '-i', sourceFile,
    '-filter_complex', filters,
    ...outputArgs,
  ]);
  return outputFiles;
}

async function writeManifest(stageDirectory) {
  const stems = [];
  for (const stemId of STEM_IDS) {
    const segments = [];
    for (const boundary of MUSIC_SEGMENT_BOUNDARIES) {
      const file = runtimeSegmentPath(stemId, boundary.index);
      segments.push({
        index: boundary.index,
        file,
        startFrame: boundary.startFrame,
        frameCount: boundary.frameCount,
        sha256: await hashFile(path.join(stageDirectory, ...file.split('/'))),
      });
    }
    stems.push({ id: stemId, segments });
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
    stems,
  };
  await writeFile(
    path.join(stageDirectory, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifest;
}

async function promoteGeneratedOutput(stageDirectory, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const parent = path.dirname(outputDirectory);
  const backup = await mkdtemp(path.join(parent, '.gameplay-music-backup-'));
  const known = [MANIFEST_FILE, 'segments', ...LEGACY_RUNTIME_FILES];
  const backedUp = [];
  const promoted = [];
  try {
    for (const name of known) {
      const destination = path.join(outputDirectory, name);
      if (await exists(destination)) {
        const backupPath = path.join(backup, name);
        await rename(destination, backupPath);
        backedUp.push({ destination, backupPath });
      }
    }
    for (const name of [MANIFEST_FILE, 'segments']) {
      const source = path.join(stageDirectory, name);
      const destination = path.join(outputDirectory, name);
      await rename(source, destination);
      promoted.push(destination);
    }
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    for (const destination of promoted.reverse()) await rm(destination, { recursive: true, force: true });
    for (const { destination, backupPath } of backedUp.reverse()) {
      if (await exists(backupPath)) await rename(backupPath, destination);
    }
    throw error;
  } finally {
    await rm(backup, { recursive: true, force: true });
  }
}

export async function generateGameplayMusicSegments({
  sourceDirectory = defaultSourceDirectory,
  outputDirectory = defaultOutputDirectory,
  reportPath = null,
  ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath = process.env.FFPROBE_PATH || 'ffprobe',
} = {}) {
  const source = path.resolve(sourceDirectory);
  const output = path.resolve(outputDirectory);
  assertSourceAndOutputAreSeparate(source, output);
  const masters = await validateSourceMasters({
    sourceDirectory: source,
    ffmpegPath,
    ffprobePath,
  });
  const stageParent = path.dirname(output);
  await mkdir(stageParent, { recursive: true });
  const stage = await mkdtemp(path.join(stageParent, '.gameplay-music-stage-'));
  try {
    for (const stemId of STEM_IDS) await mkdir(path.join(stage, 'segments', stemId), { recursive: true });
    for (const [index, stemId] of STEM_IDS.entries()) {
      await encodeStem(path.join(source, SOURCE_MASTER_FILES[index]), stemId, stage, ffmpegPath);
    }
    await writeManifest(stage);
    const technical = await validateGameplayMusicAssets(stage, undefined, { enforceReleaseGates: false });
    if (technical.errors.length) {
      throw new Error(`generated runtime failed structural validation:\n${technical.errors.join('\n')}`);
    }
    const tools = {
      ffmpeg: (await runCommand(ffmpegPath, ['-version'])).stdout.split(/\r?\n/u)[0],
      ffprobe: (await runCommand(ffprobePath, ['-version'])).stdout.split(/\r?\n/u)[0],
    };
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sourceDirectory: source,
      outputDirectory: output,
      encoding: { codec: 'libvorbis', quality: Number(encodingQuality), sampleRate: MUSIC_SAMPLE_RATE, channels: 2 },
      tools,
      sourceMasters: masters,
      runtime: technical,
    };
    await promoteGeneratedOutput(stage, output);
    if (reportPath) await writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!['--source-dir', '--output-dir', '--report'].includes(argument)) {
      throw new Error(`Unknown argument ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    index += 1;
    if (argument === '--source-dir') options.sourceDirectory = value;
    if (argument === '--output-dir') options.outputDirectory = value;
    if (argument === '--report') options.reportPath = value;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await generateGameplayMusicSegments(parseArguments(process.argv.slice(2)));
    process.stdout.write(`[PASS] Generated 64 canonical segmented OGG assets with manifest SHA-256 fields.\n`);
    process.stdout.write(`[INFO] Source masters: ${report.sourceMasters.map(master => `${path.basename(master.file)}=${master.decodedFrames} frames`).join(', ')}\n`);
  } catch (error) {
    process.stderr.write(`[FAIL] Production music generation: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
