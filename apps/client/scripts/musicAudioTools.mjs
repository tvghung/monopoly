import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';

export function runCommand(executable, args, { cwd, onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout.on('data', chunk => {
      if (onStdout) onStdout(chunk);
      else stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-32_768);
    });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      reject(new Error(`${executable}: ${error.message}. Install FFmpeg/ffprobe or set its path.`));
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${executable} exited ${String(code)}: ${stderr.slice(-4_000)}`));
    });
  });
}

export async function probeAudio(ffprobe, file) {
  const { stdout } = await runCommand(ffprobe, [
    '-v', 'error',
    '-show_format',
    '-show_streams',
    '-of', 'json',
    file,
  ]);
  return JSON.parse(stdout);
}

function parseEbur128(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  return {
    integratedLufs: Number(summary.match(/I:\s+(-?\d+(?:\.\d+)?) LUFS/u)?.[1]),
    truePeakDbtp: Number(summary.match(/Peak:\s+(-?\d+(?:\.\d+)?) dBFS/u)?.[1]),
  };
}

function mean(values, frames) {
  return values.map(value => value / Math.max(1, frames));
}

export async function measurePcm(ffmpeg, args, {
  sampleRate,
  boundaryFrames = [],
  withLoudness = false,
} = {}) {
  const windowFrames = Math.max(1, Math.round(sampleRate * 0.01));
  const boundarySet = new Set(boundaryFrames);
  const tailLeft = new Float32Array(windowFrames);
  const tailRight = new Float32Array(windowFrames);
  let tailCount = 0;
  let firstCount = 0;
  let sampleRemainder = Buffer.alloc(0);
  let frames = 0;
  let samplePeak = 0;
  let nonFiniteSamples = 0;
  let nonZeroSamples = 0;
  let maxAdjacentJump = 0;
  let previousLeft = 0;
  let previousRight = 0;
  let firstFrame = null;
  let lastFrame = null;
  const firstSum = [0, 0];
  const seams = [];
  let pendingSeam = null;

  const finishPendingSeam = () => {
    if (!pendingSeam) return;
    pendingSeam.dcDifference = Math.max(
      Math.abs(pendingSeam.headMean[0] - pendingSeam.tailMean[0]),
      Math.abs(pendingSeam.headMean[1] - pendingSeam.tailMean[1]),
    );
    seams.push(pendingSeam);
    pendingSeam = null;
  };

  const consume = chunk => {
    const data = sampleRemainder.length ? Buffer.concat([sampleRemainder, chunk]) : chunk;
    const completeBytes = data.length - data.length % 8;
    for (let offset = 0; offset < completeBytes; offset += 8) {
      const left = data.readFloatLE(offset);
      const right = data.readFloatLE(offset + 4);
      const frame = frames;
      if (!Number.isFinite(left) || !Number.isFinite(right)) nonFiniteSamples += 1;
      samplePeak = Math.max(samplePeak, Math.abs(left), Math.abs(right));
      if (Math.abs(left) > 0.00001 || Math.abs(right) > 0.00001) nonZeroSamples += 1;
      if (frame === 0) firstFrame = [left, right];
      else maxAdjacentJump = Math.max(
        maxAdjacentJump,
        Math.abs(left - previousLeft),
        Math.abs(right - previousRight),
      );
      if (firstCount < windowFrames) {
        firstSum[0] += left;
        firstSum[1] += right;
        firstCount += 1;
      }
      if (pendingSeam && pendingSeam.headFrames < windowFrames) {
        pendingSeam.headSum[0] += left;
        pendingSeam.headSum[1] += right;
        pendingSeam.headFrames += 1;
        pendingSeam.headMean = mean(pendingSeam.headSum, pendingSeam.headFrames);
        if (pendingSeam.headFrames === windowFrames) finishPendingSeam();
      }
      if (boundarySet.has(frame)) {
        finishPendingSeam();
        const tailFrames = Math.min(tailCount, windowFrames);
        const tailSum = [0, 0];
        for (let index = 0; index < tailFrames; index += 1) {
          tailSum[0] += tailLeft[index];
          tailSum[1] += tailRight[index];
        }
        const tailMean = mean(tailSum, tailFrames);
        pendingSeam = {
          boundaryFrame: frame,
          endSample: [previousLeft, previousRight],
          nextStartSample: [left, right],
          boundarySampleJump: Math.max(
            Math.abs(left - previousLeft),
            Math.abs(right - previousRight),
          ),
          localAdjacentSampleReference: maxAdjacentJump,
          tailMean,
          headMean: [left, right],
          headSum: [left, right],
          headFrames: 1,
          dcDifference: 0,
        };
      }
      const ringIndex = frame % windowFrames;
      tailLeft[ringIndex] = left;
      tailRight[ringIndex] = right;
      tailCount = Math.min(windowFrames, tailCount + 1);
      previousLeft = left;
      previousRight = right;
      lastFrame = [left, right];
      frames += 1;
    }
    sampleRemainder = data.subarray(completeBytes);
  };

  const { stderr } = await runCommand(ffmpeg, args, { onStdout: consume });
  if (sampleRemainder.length || !frames || nonFiniteSamples) {
    throw new Error('Invalid, empty, or non-finite stereo decoded PCM');
  }
  finishPendingSeam();

  const tailFrames = Math.min(tailCount, windowFrames);
  const tailSum = [0, 0];
  for (let index = 0; index < tailFrames; index += 1) {
    tailSum[0] += tailLeft[index];
    tailSum[1] += tailRight[index];
  }
  const loopSeam = {
    boundaryFrame: frames,
    endSample: lastFrame,
    nextStartSample: firstFrame,
    boundarySampleJump: Math.max(
      Math.abs((firstFrame?.[0] ?? 0) - (lastFrame?.[0] ?? 0)),
      Math.abs((firstFrame?.[1] ?? 0) - (lastFrame?.[1] ?? 0)),
    ),
    localAdjacentSampleReference: maxAdjacentJump,
    tailMean: mean(tailSum, tailFrames),
    headMean: mean(firstSum, firstCount),
    dcDifference: Math.max(
      Math.abs((firstSum[0] / Math.max(1, firstCount)) - (tailSum[0] / Math.max(1, tailFrames))),
      Math.abs((firstSum[1] / Math.max(1, firstCount)) - (tailSum[1] / Math.max(1, tailFrames))),
    ),
  };
  seams.push(loopSeam);
  const loudness = withLoudness ? parseEbur128(stderr) : {};
  return {
    decodedFrames: frames,
    decodedDurationSeconds: frames / sampleRate,
    decodedPcmBytes: frames * 2 * 4,
    samplePeak,
    nonZeroSamples,
    maxAdjacentJump,
    seams,
    maxBoundaryJump: Math.max(...seams.map(seam => seam.boundarySampleJump)),
    maxBoundaryDcChange: Math.max(...seams.map(seam => seam.dcDifference)),
    ...loudness,
  };
}

export function decodedPcmArgs(inputArgs) {
  return [
    '-hide_banner', '-nostdin', '-xerror',
    ...inputArgs,
    '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1',
  ];
}
