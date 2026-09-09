import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_RUNTIME_FILES,
  MANIFEST_FILE,
  MUSIC_BARS,
  MUSIC_BPM,
  MUSIC_BEATS_PER_BAR,
  MUSIC_DURATION_SECONDS,
  MUSIC_SAMPLE_RATE,
  MUSIC_SEGMENT_BOUNDARIES,
  MUSIC_SEGMENT_BARS,
  MUSIC_SEGMENT_COUNT,
  MUSIC_TOTAL_FRAMES,
  RUNTIME_LEVEL_3_GAINS,
  STEM_IDS,
  expectedDecodedFrames,
  expectedRuntimePaths,
  isSafeRuntimeSegmentPath,
  isSha256,
} from './musicAssetContract.mjs';
import { decodedPcmArgs, measurePcm, probeAudio } from './musicAudioTools.mjs';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const assetRoot = path.join(clientRoot, 'public', 'audio', 'music', 'gameplay');
const expectedPaths = new Set(expectedRuntimePaths());
const minimumAudioPeak = 0.00001;
const maximumBoundaryJump = 0.5;
const maximumBoundaryDcChange = 0.05;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function listFiles(root, current = root) {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, file));
    else if (entry.isFile()) files.push(path.relative(root, file).split(path.sep).join('/'));
  }
  return files;
}

async function hashFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

function readNumber(record, key) {
  const value = record?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be finite`);
  return value;
}

function readInteger(record, key) {
  const value = readNumber(record, key);
  if (!Number.isSafeInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
}

function validateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('manifest root must be an object');
  if (value.schemaVersion !== 1) throw new Error('manifest schemaVersion must be 1');
  const trackValue = value.track;
  if (!trackValue || typeof trackValue !== 'object' || Array.isArray(trackValue)) throw new Error('manifest track must be an object');
  const track = {
    bpm: readNumber(trackValue, 'bpm'),
    beatsPerBar: readInteger(trackValue, 'beatsPerBar'),
    bars: readInteger(trackValue, 'bars'),
    segmentBars: readInteger(trackValue, 'segmentBars'),
    segmentCount: readInteger(trackValue, 'segmentCount'),
    sampleRate: readInteger(trackValue, 'sampleRate'),
    totalFrames: readInteger(trackValue, 'totalFrames'),
  };
  if (track.bpm !== MUSIC_BPM) throw new Error(`manifest BPM must be ${MUSIC_BPM}`);
  if (track.beatsPerBar !== MUSIC_BEATS_PER_BAR) throw new Error(`manifest beatsPerBar must be ${MUSIC_BEATS_PER_BAR}`);
  if (track.bars !== MUSIC_BARS) throw new Error(`manifest bars must be ${MUSIC_BARS}`);
  if (track.segmentBars !== MUSIC_SEGMENT_BARS) throw new Error(`manifest segmentBars must be ${MUSIC_SEGMENT_BARS}`);
  if (track.segmentCount !== MUSIC_SEGMENT_COUNT) throw new Error(`manifest segmentCount must be ${MUSIC_SEGMENT_COUNT}`);
  if (track.sampleRate !== MUSIC_SAMPLE_RATE) throw new Error(`manifest sampleRate must be ${MUSIC_SAMPLE_RATE}`);
  if (track.totalFrames !== MUSIC_TOTAL_FRAMES) throw new Error(`manifest totalFrames must be ${MUSIC_TOTAL_FRAMES}`);
  if (!Array.isArray(value.stems) || value.stems.length !== STEM_IDS.length) {
    throw new Error(`manifest must contain ${STEM_IDS.length} stems`);
  }

  const stems = [];
  const ids = new Set();
  for (const [stemPosition, rawStem] of value.stems.entries()) {
    if (!rawStem || typeof rawStem !== 'object' || Array.isArray(rawStem)) throw new Error(`stem ${stemPosition} must be an object`);
    if (typeof rawStem.id !== 'string' || !STEM_IDS.includes(rawStem.id)) throw new Error(`unknown stem id ${String(rawStem.id)}`);
    if (ids.has(rawStem.id)) throw new Error(`duplicate stem id ${rawStem.id}`);
    ids.add(rawStem.id);
    if (!Array.isArray(rawStem.segments) || rawStem.segments.length !== MUSIC_SEGMENT_COUNT) {
      throw new Error(`${rawStem.id} must contain ${MUSIC_SEGMENT_COUNT} segments`);
    }
    const segments = rawStem.segments.map((rawSegment, segmentPosition) => {
      if (!rawSegment || typeof rawSegment !== 'object' || Array.isArray(rawSegment)) {
        throw new Error(`${rawStem.id} segment ${segmentPosition} must be an object`);
      }
      const segment = {
        index: readInteger(rawSegment, 'index'),
        file: rawSegment.file,
        startFrame: readInteger(rawSegment, 'startFrame'),
        frameCount: readInteger(rawSegment, 'frameCount'),
        sha256: rawSegment.sha256,
      };
      const expected = MUSIC_SEGMENT_BOUNDARIES[segmentPosition];
      if (!expected || segment.index !== expected.index) throw new Error(`${rawStem.id} has an invalid segment index`);
      if (segment.startFrame !== expected.startFrame || segment.frameCount !== expected.frameCount) {
        throw new Error(`${rawStem.id} has an invalid cumulative frame boundary`);
      }
      if (!isSafeRuntimeSegmentPath(segment.file, rawStem.id, segment.index)) {
        throw new Error(`${rawStem.id} segment ${segmentPosition} has an unsafe path`);
      }
      if (!isSha256(segment.sha256)) throw new Error(`${rawStem.id} segment ${segmentPosition} has a missing or invalid SHA-256`);
      return segment;
    });
    stems.push({ id: rawStem.id, segments });
  }
  for (const stemId of STEM_IDS) {
    if (!ids.has(stemId)) throw new Error(`missing stem ${stemId}`);
  }
  const orderedStems = STEM_IDS.map(stemId => stems.find(stem => stem.id === stemId));
  for (let index = 0; index < MUSIC_SEGMENT_COUNT; index += 1) {
    const reference = orderedStems[0].segments[index];
    for (const stem of orderedStems.slice(1)) {
      const segment = stem.segments[index];
      if (segment.startFrame !== reference.startFrame || segment.frameCount !== reference.frameCount) {
        throw new Error(`cross-stem timeline mismatch at segment ${index}`);
      }
    }
  }
  return { schemaVersion: 1, track, stems: orderedStems };
}

async function inspectRuntimeSegment(file, segment, ffmpeg, ffprobe, sourceSampleRate) {
  const info = await probeAudio(ffprobe, file);
  const stream = info.streams?.find(candidate => candidate.codec_type === 'audio');
  if (info.format?.format_name !== 'ogg' || info.streams?.length !== 1
    || stream?.codec_name !== 'vorbis' || stream?.codec_type !== 'audio') {
    throw new Error('expected one OGG/Vorbis audio stream');
  }
  if (stream.channels !== 2) throw new Error(`expected stereo; received ${String(stream.channels)} channels`);
  const sampleRate = Number(stream.sample_rate);
  if (sampleRate !== MUSIC_SAMPLE_RATE) throw new Error(`sample rate must be ${MUSIC_SAMPLE_RATE}; received ${String(sampleRate)}`);
  const containerFrames = Number(stream.duration_ts);
  if (!Number.isSafeInteger(containerFrames) || Math.abs(containerFrames - segment.frameCount) > 1) {
    throw new Error(`container timeline differs from expected ${segment.frameCount} frames`);
  }
  const decoded = await measurePcm(
    ffmpeg,
    decodedPcmArgs(['-i', file]),
    { sampleRate },
  );
  const expectedFrames = expectedDecodedFrames(segment.frameCount, decoded.sampleRate ?? sampleRate, sourceSampleRate);
  if (Math.abs(decoded.decodedFrames - expectedFrames) > 1) {
    throw new Error(`decoded frame count ${decoded.decodedFrames} differs from expected ${expectedFrames}`);
  }
  if (decoded.samplePeak <= minimumAudioPeak) throw new Error('no meaningful non-zero decoded audio');
  if (decoded.samplePeak >= 1) throw new Error('decoded PCM clips at full scale');
  return {
    bytes: (await stat(file)).size,
    codec: stream.codec_name,
    sampleRate,
    channels: stream.channels,
    containerFrames,
    decodedFrames: decoded.decodedFrames,
    decodedPcmBytes: decoded.decodedPcmBytes,
    samplePeak: decoded.samplePeak,
  };
}

function loudnessArgs(listFile, filter) {
  return [
    '-hide_banner', '-nostdin', '-xerror',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-filter_complex', `[0:a]${filter}ebur128=peak=true[out]`,
    '-map', '[out]', '-ac', '2', '-ar', String(MUSIC_SAMPLE_RATE),
    '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1',
  ];
}

function mixArgs(listFiles, gains) {
  const inputs = listFiles.flatMap(file => ['-f', 'concat', '-safe', '0', '-i', file]);
  const volumes = gains.map((gain, index) => `[${index}:a]volume=${gain}[stem${index}]`).join(';');
  const names = gains.map((_, index) => `[stem${index}]`).join('');
  return [
    '-hide_banner', '-nostdin', '-xerror',
    ...inputs,
    '-filter_complex', `${volumes};${names}amix=inputs=${gains.length}:normalize=0:duration=longest,ebur128=peak=true[out]`,
    '-map', '[out]', '-ac', '2', '-ar', String(MUSIC_SAMPLE_RATE),
    '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1',
  ];
}

async function writeConcatList(listDirectory, assetDirectory, stem) {
  const file = path.join(listDirectory, `${stem.id}.ffconcat`);
  const lines = ['ffconcat version 1.0'];
  for (const segment of stem.segments) {
    lines.push(
      `file '${path.join(assetDirectory, ...segment.file.split('/')).replaceAll('\\', '/').replaceAll("'", "'\\''")}'`,
      `duration ${(segment.frameCount / MUSIC_SAMPLE_RATE).toFixed(12)}`,
    );
  }
  await writeFile(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

function validateSeams(stemId, measurement, report) {
  const seams = measurement.seams.map((seam, index) => ({
    boundary: index < MUSIC_SEGMENT_COUNT - 1 ? `${String(index).padStart(2, '0')} → ${String(index + 1).padStart(2, '0')}` : '15 → 00',
    endSample: seam.endSample,
    nextStartSample: seam.nextStartSample,
    boundarySampleJump: seam.boundarySampleJump,
    localAdjacentSampleReference: seam.localAdjacentSampleReference,
    shortWindowDcDifference: seam.dcDifference,
  }));
  report.seams[stemId] = seams;
  for (const seam of seams) {
    if (seam.boundarySampleJump > maximumBoundaryJump
      && seam.boundarySampleJump > 4 * Math.max(seam.localAdjacentSampleReference, Number.EPSILON)) {
      report.errors.push(`${stemId}: extreme seam discontinuity at ${seam.boundary}`);
    }
    if (seam.shortWindowDcDifference > maximumBoundaryDcChange) {
      report.warnings.push(`${stemId}: seam ${seam.boundary} has a >0.05 full-scale 10 ms DC change`);
    }
  }
}

function runtimeFilesOutsideContract(files) {
  return files.filter(file => !expectedPaths.has(file));
}

function isMissingProductionAssetError(error) {
  return error.includes(`${MANIFEST_FILE}: missing`)
    || error.includes('canonical runtime segment set unavailable')
    || error.includes('required segmented runtime asset missing');
}

export async function validateGameplayMusicAssets(
  directory = assetRoot,
  buildDirectory,
  { enforceReleaseGates = true } = {},
) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    contract: {
      bpm: MUSIC_BPM,
      bars: MUSIC_BARS,
      segmentBars: MUSIC_SEGMENT_BARS,
      segmentCount: MUSIC_SEGMENT_COUNT,
      sampleRate: MUSIC_SAMPLE_RATE,
      totalFrames: MUSIC_TOTAL_FRAMES,
      durationSeconds: MUSIC_DURATION_SECONDS,
    },
    manifest: null,
    stems: [],
    seams: {},
    runtimeLevel3Mix: null,
    unitySumMix: null,
    errors: [],
    warnings: [],
  };
  const files = await listFiles(directory);
  for (const legacy of LEGACY_RUNTIME_FILES) {
    if (files.includes(legacy)) report.errors.push(`${legacy}: obsolete legacy full runtime stem OGG`);
  }
  for (const extra of runtimeFilesOutsideContract(files)) {
    report.errors.push(`${extra}: unexpected file in canonical runtime music output`);
  }

  const manifestPath = path.join(directory, MANIFEST_FILE);
  let manifest;
  try {
    manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    report.manifest = {
      path: manifestPath,
      sha256: await hashFile(manifestPath),
      schemaVersion: manifest.schemaVersion,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') report.errors.push(`${MANIFEST_FILE}: missing production manifest`);
    else report.errors.push(`${MANIFEST_FILE}: ${errorMessage(error)}`);
    if (!manifest) {
      if (!files.some(file => file.startsWith('segments/'))) report.errors.push('canonical runtime segment set unavailable');
      return report;
    }
  }
  if (report.errors.length) return report;

  const segmentMeasurements = new Map();
  segmentScan: for (const stem of manifest.stems) {
    const stemReport = { id: stem.id, segments: [], decodedFrames: 0, sampleRate: MUSIC_SAMPLE_RATE, channels: 2 };
    report.stems.push(stemReport);
    for (const segment of stem.segments) {
      const file = path.join(directory, ...segment.file.split('/'));
      try {
        const fileHash = await hashFile(file);
        if (fileHash !== segment.sha256) throw new Error('SHA-256 does not match manifest');
        const measurement = await inspectRuntimeSegment(file, segment, ffmpeg, ffprobe, manifest.track.sampleRate);
        stemReport.segments.push({ ...segment, ...measurement });
        stemReport.decodedFrames += measurement.decodedFrames;
        const key = String(segment.index);
        const peers = segmentMeasurements.get(key) ?? [];
        peers.push({ stemId: stem.id, measurement });
        segmentMeasurements.set(key, peers);
      } catch (error) {
        if (error?.code === 'ENOENT') report.errors.push(`${segment.file}: required segmented runtime asset missing`);
        else report.errors.push(`${segment.file}: ${errorMessage(error)}`);
        break segmentScan;
      }
    }
  }
  for (const [index, peers] of segmentMeasurements) {
    const reference = peers[0]?.measurement;
    if (!reference) continue;
    for (const peer of peers.slice(1)) {
      for (const key of ['sampleRate', 'channels', 'decodedFrames']) {
        if (peer.measurement[key] !== reference[key]) {
          report.errors.push(`segment ${index}: ${peer.stemId} ${key} differs from Foundation`);
        }
      }
    }
  }
  if (report.errors.length) return report;

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-music-validator-'));
  try {
    const lists = [];
    for (const stem of manifest.stems) lists.push(await writeConcatList(temporaryRoot, directory, stem));
    for (let index = 0; index < manifest.stems.length; index += 1) {
      const stem = manifest.stems[index];
      let reconstructedBoundary = 0;
      const boundaryFrames = report.stems[index].segments.slice(0, -1).map(segment => {
        reconstructedBoundary += segment.decodedFrames;
        return reconstructedBoundary;
      });
      const measurement = await measurePcm(
        ffmpeg,
        loudnessArgs(lists[index], ''),
        {
          sampleRate: MUSIC_SAMPLE_RATE,
          boundaryFrames,
          withLoudness: true,
        },
      );
      if (Math.abs(measurement.decodedFrames - MUSIC_TOTAL_FRAMES) > 1) {
        report.errors.push(`${stem.id}: reconstructed runtime timeline differs from ${MUSIC_TOTAL_FRAMES} frames`);
      }
      if (!Number.isFinite(measurement.integratedLufs) || !Number.isFinite(measurement.truePeakDbtp)) {
        report.errors.push(`${stem.id}: no finite loudness/true-peak measurement`);
      }
      if (measurement.samplePeak >= 1 || measurement.nonZeroSamples === 0) {
        report.errors.push(`${stem.id}: reconstructed PCM is clipped or silent`);
      }
      validateSeams(stem.id, measurement, report);
      Object.assign(report.stems[index], {
        reconstructedFrames: measurement.decodedFrames,
        integratedLufs: measurement.integratedLufs,
        truePeakDbtp: measurement.truePeakDbtp,
        samplePeak: measurement.samplePeak,
        decodedPcmBytes: measurement.decodedPcmBytes,
      });
    }
    const level3 = await measurePcm(
      ffmpeg,
      mixArgs(lists, RUNTIME_LEVEL_3_GAINS),
      { sampleRate: MUSIC_SAMPLE_RATE, withLoudness: true },
    );
    const unity = await measurePcm(
      ffmpeg,
      mixArgs(lists, [1, 1, 1, 1]),
      { sampleRate: MUSIC_SAMPLE_RATE, withLoudness: true },
    );
    report.runtimeLevel3Mix = {
      gains: RUNTIME_LEVEL_3_GAINS,
      decodedFrames: level3.decodedFrames,
      integratedLufs: level3.integratedLufs,
      truePeakDbtp: level3.truePeakDbtp,
      samplePeak: level3.samplePeak,
      headroomDb: -level3.truePeakDbtp,
    };
    report.unitySumMix = {
      gains: [1, 1, 1, 1],
      decodedFrames: unity.decodedFrames,
      integratedLufs: unity.integratedLufs,
      truePeakDbtp: unity.truePeakDbtp,
      samplePeak: unity.samplePeak,
      headroomDb: -unity.truePeakDbtp,
    };
    for (const [label, measurement] of [['Level 3 runtime mix', level3], ['Unity-sum mix', unity]]) {
      if (measurement.samplePeak >= 1) report.errors.push(`${label}: sample clipping`);
      if (measurement.nonZeroSamples === 0) report.errors.push(`${label}: silence`);
      if (!Number.isFinite(measurement.integratedLufs) || !Number.isFinite(measurement.truePeakDbtp)) {
        report.errors.push(`${label}: non-finite loudness or true peak`);
      }
    }
    if (enforceReleaseGates) {
      if (level3.integratedLufs < -19 || level3.integratedLufs > -15) {
        report.errors.push(`Level 3 runtime mix: integrated loudness ${level3.integratedLufs} LUFS is outside -19 to -15 LUFS`);
      }
      if (level3.truePeakDbtp > -1.5) {
        report.errors.push(`Level 3 runtime mix: true peak ${level3.truePeakDbtp} dBTP exceeds -1.5 dBTP`);
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  if (buildDirectory) {
    const buildFiles = await listFiles(buildDirectory);
    for (const file of buildFiles) {
      if (file.toLowerCase().endsWith('.wav')) report.errors.push(`${file}: source WAV must not ship in client build output`);
    }
    for (const expected of expectedPaths) {
      const source = path.join(directory, ...expected.split('/'));
      const output = path.join(buildDirectory, ...expected.split('/'));
      try {
        const sourceHash = await hashFile(source);
        const outputHash = await hashFile(output);
        if (sourceHash !== outputHash) report.errors.push(`${expected}: client build output differs from source asset`);
      } catch (error) {
        if (error?.code === 'ENOENT') report.errors.push(`${expected}: client build output is missing`);
        else report.errors.push(`${expected}: ${errorMessage(error)}`);
      }
    }
    for (const extra of runtimeFilesOutsideContract(buildFiles)) {
      report.errors.push(`${extra}: unexpected file in client build gameplay music output`);
    }
  }
  return report;
}

export function isExpectedProductionBlock(report) {
  return report.errors.length > 0 && report.errors.every(isMissingProductionAssetError);
}

function usage() {
  process.stderr.write('Usage: node scripts/validateGameplayMusicAssets.mjs [--build-output] [--report path.json]\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf('--report');
  const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;
  const remaining = args.filter((_, index) => index !== reportIndex && (reportIndex < 0 || index !== reportIndex + 1));
  if ((reportIndex >= 0 && (!reportPath || reportPath.startsWith('--'))) || remaining.some(arg => arg !== '--build-output')) {
    usage();
    process.exitCode = 1;
  } else {
    const report = await validateGameplayMusicAssets(
      assetRoot,
      args.includes('--build-output') ? path.join(clientRoot, 'dist', 'audio', 'music', 'gameplay') : undefined,
    );
    if (reportPath) await writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
    if (isExpectedProductionBlock(report)) {
      process.stdout.write('EXPECTED BLOCKED — PRODUCTION SEGMENTED MUSIC ASSETS MISSING\n');
    }
    for (const warning of report.warnings) process.stdout.write(`[WARN] ${warning}\n`);
    for (const error of report.errors) process.stderr.write(`[FAIL] ${error}\n`);
    if (!report.errors.length) process.stdout.write('[PASS] Segmented production music assets, hashes, timelines, seams, mix and build output validated. Human acceptance remains separate.\n');
    process.exitCode = report.errors.length ? 1 : 0;
  }
}
