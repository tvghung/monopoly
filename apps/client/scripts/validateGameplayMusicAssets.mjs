import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(clientRoot, 'public', 'audio', 'music', 'gameplay');
export const stemNames = ['foundation', 'city', 'wealth', 'competition'].map(id => `gameplay-${id}.ogg`);
const expectedDuration = 256 * 60 / 110;
const minimumBytes = 64 * 1024;

function run(executable, args, onData) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      if (onData) onData(chunk);
      else stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-16384); });
    child.on('error', error => reject(new Error(`${executable}: ${error.message}. Install FFmpeg/ffprobe or set FFMPEG_PATH/FFPROBE_PATH.`)));
    child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${executable} exited ${code}: ${stderr.slice(-2000)}`)));
  });
}

// Consume decoded PCM as a stream: validation does not retain four full buffers.
async function measure(ffmpeg, inputs, sampleRate, filter = '') {
  let remainder = Buffer.alloc(0);
  let samples = 0;
  let samplePeak = 0;
  let maxAdjacentJump = 0;
  let nonFiniteSamples = 0;
  const first = [0, 0];
  const last = [0, 0];
  const headSum = [0, 0];
  const tailSum = [0, 0];
  const windowFrames = Math.round(sampleRate * 0.01);
  const tail = new Float64Array(windowFrames * 2);
  const { stderr } = await run(ffmpeg, [
    '-hide_banner', '-nostdin', '-xerror', ...inputs.flatMap(file => ['-i', file]),
    '-filter_complex', `${filter}ebur128=peak=true`, '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1',
  ], chunk => {
    const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
    const completeBytes = data.length - data.length % 4;
    for (let offset = 0; offset < completeBytes; offset += 4) {
      const value = data.readFloatLE(offset);
      const channel = samples % 2;
      if (!Number.isFinite(value)) nonFiniteSamples += 1;
      samplePeak = Math.max(samplePeak, Math.abs(value));
      if (samples < 2) first[channel] = value;
      else maxAdjacentJump = Math.max(maxAdjacentJump, Math.abs(value - last[channel]));
      if (samples < tail.length) headSum[channel] += value;
      const slot = samples % tail.length;
      tailSum[channel] += value - tail[slot];
      tail[slot] = value;
      last[channel] = value;
      samples += 1;
    }
    remainder = data.subarray(completeBytes);
  });
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const integratedLufs = Number(summary.match(/I:\s+(-?\d+(?:\.\d+)?) LUFS/)?.[1]);
  const truePeakDbtp = Number(summary.match(/Peak:\s+(-?\d+(?:\.\d+)?) dBFS/)?.[1]);
  if (remainder.length || samples % 2 || !samples || nonFiniteSamples) throw new Error('Invalid/empty stereo decoded PCM');
  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbtp)) throw new Error('No finite EBU R128 loudness/true-peak measurement (audio may be silent)');
  return {
    decodedFrames: samples / 2,
    decodedDurationSeconds: samples / 2 / sampleRate,
    decodedPcmBytes: samples * 4,
    samplePeak,
    integratedLufs,
    truePeakDbtp,
    headroomDb: -truePeakDbtp,
    seam: {
      first, last, maxAdjacentJump,
      maxBoundaryJump: Math.max(...first.map((value, channel) => Math.abs(value - last[channel]))),
      maxBoundaryDcChange: Math.max(...headSum.map((value, channel) => Math.abs(value - tailSum[channel]) / windowFrames)),
      dcWindowSeconds: 0.01,
      humanListening: 'PENDING HUMAN ACCEPTANCE',
    },
  };
}

export async function validateGameplayMusicAssets(directory = assetRoot, buildDirectory) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
  const report = { measuredAt: new Date().toISOString(), expectedDurationSeconds: expectedDuration, stems: [], fullDensityMix: null, errors: [], warnings: [] };
  for (const name of stemNames) {
    const file = path.join(directory, name);
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a regular file');
      report.stems.push({ name, path: file, bytes: info.size, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
      if (info.size < minimumBytes) report.errors.push(`${name}: suspiciously small (${info.size} bytes; minimum ${minimumBytes})`);
    } catch (error) {
      report.errors.push(`${name}: missing/unreadable asset (${error.message})`);
    }
  }
  if (report.errors.length) return report;
  try {
    report.tools = {
      ffmpeg: (await run(ffmpeg, ['-version'])).stdout.split(/\r?\n/)[0],
      ffprobe: (await run(ffprobe, ['-version'])).stdout.split(/\r?\n/)[0],
    };
  } catch (error) {
    report.errors.push(error.message);
    return report;
  }
  for (const stem of report.stems) {
    try {
      const probe = JSON.parse((await run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', stem.path])).stdout);
      const [stream] = probe.streams;
      if (probe.format.format_name !== 'ogg' || probe.streams.length !== 1 || stream.codec_name !== 'vorbis' || stream.codec_type !== 'audio') throw new Error('expected one OGG/Vorbis audio stream');
      if (stream.channels !== 2) throw new Error(`expected stereo; received ${stream.channels} channels`);
      Object.assign(stem, {
        codec: stream.codec_name, sampleRate: Number(stream.sample_rate), channels: stream.channels,
        startSeconds: Number(stream.start_time), timelineFrames: Number(stream.duration_ts), timeBase: stream.time_base,
        containerDurationSeconds: Number(stream.duration),
      });
      if (!Number.isInteger(stem.sampleRate) || stem.sampleRate <= 0 || stem.timeBase !== `1/${stem.sampleRate}` || !Number.isInteger(stem.timelineFrames)) throw new Error('invalid sample rate/exact Ogg timeline');
      if (stem.startSeconds !== 0) throw new Error('timeline must start at zero');
      if (Math.abs(stem.timelineFrames - Math.round(expectedDuration * stem.sampleRate)) > 1) throw new Error('container timeline must end at the nearest sample to 64 bars at 110 BPM (one-frame tolerance)');
      if (!Number.isFinite(stem.containerDurationSeconds) || Math.abs(stem.containerDurationSeconds - expectedDuration) > 0.01) throw new Error('container duration differs from 64 bars at 110 BPM by more than 10 ms');
      Object.assign(stem, await measure(ffmpeg, [stem.path], stem.sampleRate));
      // Vorbis decoder priming may remove initial samples; every decoded stem must still match exactly.
      if (Math.abs(stem.decodedDurationSeconds - expectedDuration) > 0.01) throw new Error('decoded duration differs from 64 bars at 110 BPM by more than 10 ms');
      if (!(stem.samplePeak > 0.00001)) throw new Error('no meaningful non-zero decoded audio');
      if (stem.sampleRate !== 48000) report.warnings.push(`${stem.name}: ${stem.sampleRate} Hz; 48000 Hz is preferred`);
      if (buildDirectory) {
        const output = await readFile(path.join(buildDirectory, stem.name));
        if (createHash('sha256').update(output).digest('hex') !== stem.sha256) throw new Error('client build output differs from source asset');
        stem.buildOutput = 'PASS: byte-identical SHA-256';
      }
    } catch (error) {
      report.errors.push(`${stem.name}: ${error.message}`);
    }
  }
  const foundation = report.stems[0];
  for (const stem of report.stems.slice(1)) {
    for (const key of ['sampleRate', 'timelineFrames', 'timeBase', 'startSeconds', 'decodedFrames']) {
      if (stem[key] !== foundation[key]) report.errors.push(`${stem.name}: ${key} differs from Foundation`);
    }
  }
  if (!report.errors.length) {
    try {
      report.fullDensityMix = await measure(ffmpeg, report.stems.map(stem => stem.path), foundation.sampleRate, '[0:a][1:a][2:a][3:a]amix=inputs=4:normalize=0:duration=longest,');
      report.fullDensityMix.gains = [1, 1, 1, 1];
      report.totalDecodedPcmBytes = report.stems.reduce((total, stem) => total + stem.decodedPcmBytes, 0);
      if (report.fullDensityMix.decodedFrames !== foundation.decodedFrames) report.errors.push('Full-density mix decoded timeline differs from stems');
      if (Math.abs(report.fullDensityMix.integratedLufs - (-17)) > 2) report.warnings.push('Full-density mix is outside the working -17 +/- 2 LUFS target; review the measured mix');
    } catch (error) {
      report.errors.push(`Full-density mix: ${error.message}`);
    }
  }
  for (const measured of [...report.stems, ...(report.fullDensityMix ? [{ name: 'Full-density mix', ...report.fullDensityMix }] : [])]) {
    if (!measured.seam) continue;
    if (measured.samplePeak >= 1 || measured.truePeakDbtp >= 0) report.errors.push(`${measured.name}: clipping/no true-peak headroom`);
    else if (measured.truePeakDbtp > -1.5) report.warnings.push(`${measured.name}: true peak exceeds working -1.5 dBTP target`);
    // ponytail: boundary statistics catch extreme defects; musical loop approval still needs listening.
    if (measured.seam.maxBoundaryJump > 0.5 && measured.seam.maxBoundaryJump > 4 * measured.seam.maxAdjacentJump) report.errors.push(`${measured.name}: extreme loop-boundary sample jump`);
    if (measured.seam.maxBoundaryDcChange > 0.05) report.warnings.push(`${measured.name}: 10 ms boundary mean changes by >0.05 full scale; inspect loop bridge`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf('--report');
  const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;
  const remaining = args.filter((_, index) => index !== reportIndex && (reportIndex < 0 || index !== reportIndex + 1));
  if ((reportIndex >= 0 && (!reportPath || reportPath.startsWith('--'))) || remaining.some(arg => arg !== '--build-output')) {
    process.stderr.write('Usage: node scripts/validateGameplayMusicAssets.mjs [--build-output] [--report path.json]\n');
    process.exitCode = 1;
  } else {
    const report = await validateGameplayMusicAssets(assetRoot, args.includes('--build-output') ? path.join(clientRoot, 'dist', 'audio', 'music', 'gameplay') : undefined);
    if (reportPath) await writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
    for (const stem of report.stems) process.stdout.write(`[${stem.decodedFrames ? 'MEASURED' : 'FOUND'}] ${stem.name}: ${stem.bytes} bytes${stem.decodedFrames ? `, ${stem.sampleRate} Hz, ${stem.decodedFrames} frames, ${stem.integratedLufs} LUFS, ${stem.truePeakDbtp} dBTP` : ''}\n`);
    if (report.fullDensityMix) process.stdout.write(`[MEASURED] Full-density mix (unity sum): ${report.fullDensityMix.integratedLufs} LUFS, ${report.fullDensityMix.truePeakDbtp} dBTP, ${report.fullDensityMix.headroomDb} dB headroom\n`);
    for (const warning of report.warnings) process.stdout.write(`[WARN] ${warning}\n`);
    for (const error of report.errors) process.stderr.write(`[FAIL] ${error}\n`);
    if (!report.errors.length) process.stdout.write('[PASS] Actual gameplay assets: format, timeline, nonzero audio, clipping and technical seam checks. Human listening remains required.\n');
    process.exitCode = report.errors.length ? 1 : 0;
  }
}
