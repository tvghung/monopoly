import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { stemNames, validateGameplayMusicAssets } from './validateGameplayMusicAssets.mjs';

test('real FFmpeg contract rejects missing/corrupt/misaligned/silent audio and measures the unnormalized sum', async () => {
  // Technical noise fixtures exist only in a temporary test directory, never in shipped audio.
  const directory = await mkdtemp(path.join(tmpdir(), 'own-the-block-audio-validator-test-'));
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const foundation = path.join(directory, stemNames[0]);
  const city = path.join(directory, stemNames[1]);
  const build = path.join(directory, 'build');
  const render = (file, source, rate = 48000, channels = 2, extra = []) => execFileSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', source,
    ...extra, '-t', `${256 * 60 / 110}`, '-ar', `${rate}`, '-ac', `${channels}`, '-c:a', 'libvorbis', '-q:a', '3', file,
  ], { windowsHide: true });
  try {
    assert.equal((await validateGameplayMusicAssets(directory)).errors.length, 4);
    render(foundation, 'anoisesrc=color=pink:amplitude=0.03:sample_rate=48000:seed=1');
    for (const name of stemNames.slice(1)) await copyFile(foundation, path.join(directory, name));
    await mkdir(build);
    for (const name of stemNames) await copyFile(foundation, path.join(build, name));
    const valid = await validateGameplayMusicAssets(directory, build);
    assert.deepEqual(valid.errors, []);
    assert.equal(valid.stems[0].channels, 2);
    assert.equal(valid.stems[0].sampleRate, 48000);
    assert.ok(valid.stems.every(stem => stem.decodedFrames === valid.stems[0].decodedFrames && stem.buildOutput));
    assert.match(valid.stems[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(valid.totalDecodedPcmBytes, valid.stems[0].decodedFrames * 2 * 4 * 4);
    assert.ok(Math.abs(valid.fullDensityMix.truePeakDbtp - valid.stems[0].truePeakDbtp - 12.04) < 0.2, 'four identical stems sum to +12 dB, never auto-normalized');
    assert.ok(Number.isFinite(valid.fullDensityMix.integratedLufs));
    assert.ok(Number.isFinite(valid.stems[0].seam.maxBoundaryJump));

    await writeFile(city, 'placeholder');
    assert.ok((await validateGameplayMusicAssets(directory)).errors.some(error => error.includes('suspiciously small')));
    await writeFile(city, Buffer.alloc(65536, 42));
    assert.ok((await validateGameplayMusicAssets(directory)).errors.some(error => error.startsWith(`${stemNames[1]}:`)));
    render(city, 'anoisesrc=color=pink:amplitude=0.03:sample_rate=48000:seed=1', 48000, 1);
    assert.ok((await validateGameplayMusicAssets(directory)).errors.some(error => error.includes('expected stereo')));
    render(city, 'anoisesrc=color=pink:amplitude=0.03:sample_rate=48000:seed=1', 44100);
    assert.ok((await validateGameplayMusicAssets(directory)).errors.some(error => error.includes('sampleRate differs')));
    render(city, 'anoisesrc=color=pink:amplitude=0.03:sample_rate=48000:seed=1', 48000, 2, ['-af', `atrim=end_sample=${valid.stems[0].timelineFrames - 1}`]);
    assert.ok((await validateGameplayMusicAssets(directory)).errors.some(error => error.includes('timelineFrames differs')));
    render(city, 'anoisesrc=color=pink:amplitude=0.03:sample_rate=48000:seed=1', 48000, 2, ['-af', `atrim=end_sample=${valid.stems[0].timelineFrames - 960}`]);
    assert.ok((await validateGameplayMusicAssets(directory)).errors.some(error => error.includes('nearest sample')));

    // Padding is an Ogg metadata comment, so the silence test passes the size guard honestly.
    const metadata = path.join(directory, 'silence.ffmetadata');
    await writeFile(metadata, `;FFMETADATA1\ncomment=${'test-only '.repeat(10000)}\n`);
    render(city, 'anullsrc=sample_rate=48000:channel_layout=stereo', 48000, 2, ['-f', 'ffmetadata', '-i', metadata, '-map_metadata', '1']);
    assert.ok((await readFile(city)).length > 65536);
    assert.ok((await validateGameplayMusicAssets(directory)).errors.some(error => error.includes('silent') || error.includes('non-zero')));

    await copyFile(foundation, city);
    await writeFile(path.join(build, stemNames[1]), 'wrong build bytes');
    assert.ok((await validateGameplayMusicAssets(directory, build)).errors.some(error => error.includes('client build output differs')));
  } finally {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith('own-the-block-audio-validator-test-'));
    await rm(resolved, { recursive: true, force: true });
  }
});
