import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const contractPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/audio/music-contract.json');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

export const STEM_IDS = ['foundation', 'city', 'wealth', 'competition'];
export const SOURCE_MASTER_FILES = STEM_IDS.map(id => `gameplay-${id}.wav`);
export const LEGACY_RUNTIME_FILES = STEM_IDS.map(id => `gameplay-${id}.ogg`);
export const MANIFEST_FILE = 'gameplay-music.manifest.json';
export const MUSIC_BPM = contract.bpm;
export const MUSIC_BEATS_PER_BAR = contract.beatsPerBar;
export const MUSIC_BARS = contract.bars;
export const MUSIC_SEGMENT_BARS = contract.segmentBars;
export const MUSIC_SEGMENT_COUNT = MUSIC_BARS / MUSIC_SEGMENT_BARS;
export const MUSIC_PHRASE_BEATS = MUSIC_SEGMENT_BARS * MUSIC_BEATS_PER_BAR;
export const MUSIC_SAMPLE_RATE = contract.sampleRate;
export const MUSIC_TOTAL_FRAMES = musicBoundaryFrame(MUSIC_SEGMENT_COUNT, MUSIC_SAMPLE_RATE);
export const MUSIC_DURATION_SECONDS = MUSIC_BARS * MUSIC_BEATS_PER_BAR * 60 / MUSIC_BPM;
export const RUNTIME_LEVEL_3_GAINS = [1, 0.9, 0.8, 0.75];

export function musicBoundaryFrame(index, sampleRate = MUSIC_SAMPLE_RATE) {
  return Math.round(index * MUSIC_PHRASE_BEATS * 60 / MUSIC_BPM * sampleRate);
}

export function calculateMusicSegmentBoundaries(sampleRate = MUSIC_SAMPLE_RATE) {
  return Array.from({ length: MUSIC_SEGMENT_COUNT }, (_, index) => {
    const startFrame = musicBoundaryFrame(index, sampleRate);
    return {
      index,
      startFrame,
      frameCount: musicBoundaryFrame(index + 1, sampleRate) - startFrame,
    };
  });
}

export const MUSIC_SEGMENT_BOUNDARIES = calculateMusicSegmentBoundaries();

export function runtimeSegmentPath(stemId, index) {
  return path.posix.join('segments', stemId, `${String(index).padStart(2, '0')}.ogg`);
}

export function isSafeRuntimeSegmentPath(value, stemId, index) {
  return value === runtimeSegmentPath(stemId, index)
    && !value.includes('..')
    && !value.includes('\\')
    && value.startsWith(`segments/${stemId}/`);
}

export function expectedRuntimePaths() {
  return [
    MANIFEST_FILE,
    ...STEM_IDS.flatMap(stemId => MUSIC_SEGMENT_BOUNDARIES.map(segment => (
      runtimeSegmentPath(stemId, segment.index)
    ))),
  ];
}

export function expectedDecodedFrames(frameCount, decodedSampleRate, sourceSampleRate = MUSIC_SAMPLE_RATE) {
  return Math.round((frameCount / sourceSampleRate) * decodedSampleRate);
}

export function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
