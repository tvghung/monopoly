import { tileState, type PublicGameState } from '@monopoly/shared';
import type { MusicIntensity } from './types';
import musicContract from './music-contract.json';

export const MUSIC_BPM = musicContract.bpm;
export const MUSIC_BARS = musicContract.bars;
export const MUSIC_BEATS = MUSIC_BARS * musicContract.beatsPerBar;
export const MUSIC_LOOP_DURATION_SECONDS = MUSIC_BEATS * 60 / MUSIC_BPM;
export const MUSIC_PHRASE_BEATS = musicContract.segmentBars * musicContract.beatsPerBar;
export const MUSIC_BEATS_PER_BAR = musicContract.beatsPerBar;
export const MUSIC_SEGMENT_BARS = musicContract.segmentBars;
export const MUSIC_SEGMENT_COUNT = MUSIC_BARS / MUSIC_SEGMENT_BARS;
export const MUSIC_SAMPLE_RATE = musicContract.sampleRate;
export const MUSIC_MANIFEST_URL = '/audio/music/gameplay/gameplay-music.manifest.json';
export const MUSIC_ASSET_ROOT = '/audio/music/gameplay/';

export const GAMEPLAY_MUSIC_STEMS = [
  { id: 'foundation' },
  { id: 'city' },
  { id: 'wealth' },
  { id: 'competition' },
] as const;

export const MUSIC_STEM_IDS = GAMEPLAY_MUSIC_STEMS.map(stem => stem.id);
export type MusicStemId = typeof GAMEPLAY_MUSIC_STEMS[number]['id'];

export interface GameplayMusicSegment {
  index: number;
  file: string;
  startFrame: number;
  frameCount: number;
  sha256: string;
}

export interface GameplayMusicStem {
  id: MusicStemId;
  segments: readonly GameplayMusicSegment[];
}

export interface GameplayMusicTrack {
  bpm: number;
  beatsPerBar: number;
  bars: number;
  segmentBars: number;
  segmentCount: number;
  sampleRate: number;
  totalFrames: number;
}

export interface GameplayMusicManifest {
  schemaVersion: 1;
  track: GameplayMusicTrack;
  stems: readonly GameplayMusicStem[];
}

export interface MusicSegmentBoundary {
  index: number;
  startFrame: number;
  frameCount: number;
}

export function musicBoundaryFrame(index: number, sampleRate: number): number {
  return Math.round(index * MUSIC_PHRASE_BEATS * 60 / MUSIC_BPM * sampleRate);
}

export function calculateMusicSegmentBoundaries(
  sampleRate = MUSIC_SAMPLE_RATE,
): readonly MusicSegmentBoundary[] {
  return Array.from({ length: MUSIC_SEGMENT_COUNT }, (_, index) => {
    const startFrame = musicBoundaryFrame(index, sampleRate);
    return {
      index,
      startFrame,
      frameCount: musicBoundaryFrame(index + 1, sampleRate) - startFrame,
    };
  });
}

export const MUSIC_TOTAL_SOURCE_FRAMES = musicBoundaryFrame(MUSIC_SEGMENT_COUNT, MUSIC_SAMPLE_RATE);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidManifest(message: string): never {
  throw new Error(`Invalid gameplay music manifest: ${message}`);
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidManifest(`${key} must be finite`);
  return value;
}

function readInteger(record: Record<string, unknown>, key: string): number {
  const value = readNumber(record, key);
  if (!Number.isSafeInteger(value)) invalidManifest(`${key} must be an integer`);
  return value;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') invalidManifest(`${key} must be a string`);
  return value;
}

export function isSafeGameplayMusicSegmentPath(
  value: unknown,
  stemId?: MusicStemId,
): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || value.includes('\0')) {
    return false;
  }
  const parts = value.split('/');
  if (parts.length !== 3 || parts[0] !== 'segments' || (stemId && parts[1] !== stemId)) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(parts[1] ?? '') || !/^[A-Za-z0-9_-]+\.ogg$/.test(parts[2] ?? '')) {
    return false;
  }
  return true;
}

export function parseGameplayMusicManifest(value: unknown): GameplayMusicManifest {
  if (!isRecord(value)) invalidManifest('root must be an object');
  if (value.schemaVersion !== 1) invalidManifest('schemaVersion must be 1');
  const trackValue = value.track;
  if (!isRecord(trackValue)) invalidManifest('track must be an object');
  const track: GameplayMusicTrack = {
    bpm: readNumber(trackValue, 'bpm'),
    beatsPerBar: readInteger(trackValue, 'beatsPerBar'),
    bars: readInteger(trackValue, 'bars'),
    segmentBars: readInteger(trackValue, 'segmentBars'),
    segmentCount: readInteger(trackValue, 'segmentCount'),
    sampleRate: readInteger(trackValue, 'sampleRate'),
    totalFrames: readInteger(trackValue, 'totalFrames'),
  };
  if (track.bpm !== MUSIC_BPM) invalidManifest(`bpm must be ${MUSIC_BPM}`);
  if (track.beatsPerBar !== MUSIC_BEATS_PER_BAR) invalidManifest(`beatsPerBar must be ${MUSIC_BEATS_PER_BAR}`);
  if (track.bars !== MUSIC_BARS) invalidManifest(`bars must be ${MUSIC_BARS}`);
  if (track.segmentBars !== MUSIC_SEGMENT_BARS) invalidManifest(`segmentBars must be ${MUSIC_SEGMENT_BARS}`);
  if (track.segmentCount !== MUSIC_SEGMENT_COUNT) invalidManifest(`segmentCount must be ${MUSIC_SEGMENT_COUNT}`);
  if (track.sampleRate <= 0) invalidManifest('sampleRate must be positive');
  const boundaries = calculateMusicSegmentBoundaries(track.sampleRate);
  if (track.totalFrames !== musicBoundaryFrame(MUSIC_SEGMENT_COUNT, track.sampleRate)) {
    invalidManifest('totalFrames does not match the source timeline');
  }

  if (!Array.isArray(value.stems) || value.stems.length !== GAMEPLAY_MUSIC_STEMS.length) {
    invalidManifest(`stems must contain ${GAMEPLAY_MUSIC_STEMS.length} entries`);
  }
  const stemIds = new Set<MusicStemId>();
  const stems = value.stems.map((stemValue, stemPosition): GameplayMusicStem => {
    if (!isRecord(stemValue)) invalidManifest(`stem ${stemPosition} must be an object`);
    const rawId = readString(stemValue, 'id');
    if (!MUSIC_STEM_IDS.includes(rawId as MusicStemId)) invalidManifest(`unknown stem id ${rawId}`);
    const id = rawId as MusicStemId;
    if (stemIds.has(id)) invalidManifest(`duplicate stem id ${id}`);
    stemIds.add(id);
    if (!Array.isArray(stemValue.segments) || stemValue.segments.length !== MUSIC_SEGMENT_COUNT) {
      invalidManifest(`${id} must contain ${MUSIC_SEGMENT_COUNT} segments`);
    }
    const segments = stemValue.segments.map((segmentValue, segmentPosition): GameplayMusicSegment => {
      if (!isRecord(segmentValue)) invalidManifest(`${id} segment ${segmentPosition} must be an object`);
      const segment: GameplayMusicSegment = {
        index: readInteger(segmentValue, 'index'),
        file: readString(segmentValue, 'file'),
        startFrame: readInteger(segmentValue, 'startFrame'),
        frameCount: readInteger(segmentValue, 'frameCount'),
        sha256: readString(segmentValue, 'sha256'),
      };
      const expected = boundaries[segmentPosition];
      if (!expected || segment.index !== expected.index) invalidManifest(`${id} has an invalid segment index`);
      if (segment.startFrame !== expected.startFrame || segment.frameCount !== expected.frameCount) {
        invalidManifest(`${id} has an invalid cumulative frame boundary`);
      }
      if (segment.startFrame < 0 || segment.frameCount <= 0) invalidManifest(`${id} has invalid frame values`);
      if (segment.startFrame + segment.frameCount > track.totalFrames) invalidManifest(`${id} exceeds totalFrames`);
      if (!isSafeGameplayMusicSegmentPath(segment.file, id)) invalidManifest(`${id} has an unsafe segment path`);
      if (segment.sha256 !== '' && !/^[A-Fa-f0-9]{64}$/.test(segment.sha256)) {
        invalidManifest(`${id} has an invalid SHA-256 field`);
      }
      return segment;
    });
    return { id, segments };
  });
  for (const stem of GAMEPLAY_MUSIC_STEMS) {
    if (!stemIds.has(stem.id)) invalidManifest(`missing stem ${stem.id}`);
  }
  const orderedStems = GAMEPLAY_MUSIC_STEMS.map(({ id }) => {
    const stem = stems.find(candidate => candidate.id === id);
    if (!stem) invalidManifest(`missing stem ${id}`);
    return stem;
  });
  for (let index = 0; index < MUSIC_SEGMENT_COUNT; index += 1) {
    const reference = orderedStems[0]?.segments[index];
    if (!reference) invalidManifest(`missing segment ${index}`);
    for (const stem of orderedStems.slice(1)) {
      const segment = stem.segments[index];
      if (!segment || segment.startFrame !== reference.startFrame || segment.frameCount !== reference.frameCount) {
        invalidManifest(`cross-stem timeline mismatch at segment ${index}`);
      }
    }
  }
  return { schemaVersion: 1, track, stems: orderedStems };
}

export const MUSIC_SECTIONS = [
  { name: 'INTRO', startBar: 0, bars: 4 },
  { name: 'A', startBar: 4, bars: 8 },
  { name: "A'", startBar: 12, bars: 8 },
  { name: 'B', startBar: 20, bars: 8 },
  { name: 'BRIDGE', startBar: 28, bars: 4 },
  { name: 'C', startBar: 32, bars: 8 },
  { name: 'D', startBar: 40, bars: 8 },
  { name: "A''", startBar: 48, bars: 8 },
  { name: 'LOOP_BRIDGE', startBar: 56, bars: 8 },
] as const;

export const MUSIC_TRACK_METADATA = {
  bpm: MUSIC_BPM,
  beatsPerBar: MUSIC_BEATS_PER_BAR,
  beats: MUSIC_BEATS,
  bars: MUSIC_BARS,
  durationSeconds: MUSIC_LOOP_DURATION_SECONDS,
  timeSignature: '4/4',
  key: 'F Major',
  transitionBars: 4,
  transitionBeats: MUSIC_PHRASE_BEATS,
  transitionFadeBeats: 2,
  sections: MUSIC_SECTIONS,
  stems: GAMEPLAY_MUSIC_STEMS,
} as const;

export const MUSIC_STEM_LEVELS: Readonly<Record<MusicIntensity, readonly number[]>> = {
  0: [1, 0, 0, 0],
  1: [1, 0.75, 0, 0],
  2: [1, 0.85, 0.7, 0],
  3: [1, 0.9, 0.8, 0.75],
};

const BUYABLE_TILE_COUNT = tileState.filter(tile => tile.price !== undefined).length;
const BUILDABLE_LEVEL_COUNT = tileState.filter(tile => tile.rentTiers !== undefined).length * 5;
const INTENSITY_THRESHOLDS = [0.18, 0.4, 0.65] as const;
const INTENSITY_HYSTERESIS = 0.035;

export const MUSIC_INTENSITY_WEIGHTS = {
  propertyOwnership: 0.4,
  development: 0.25,
  progression: 0.2,
  financialPressure: 0.15,
} as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function calculateMusicIntensityScore(state: PublicGameState): number {
  if (!state.boardState.gameStarted) return 0;
  const ownedProperties = Object.values(state.boardState.ownedProps);
  const activePlayers = Object.values(state.players);
  const finishedCount = Object.keys(state.boardState.finishedPlayers).length;
  const playerCount = Math.max(2, activePlayers.length + finishedCount);
  const lowCashRatio = activePlayers.length === 0
    ? 0
    : activePlayers.filter(player => player.accountBalance <= 250).length / activePlayers.length;
  const financialPressure = clamp01(
    finishedCount / playerCount * 0.65
    + lowCashRatio * 0.2
    + (state.boardState.paymentShortfall ? 0.25 : 0),
  );

  return clamp01(
    ownedProperties.length / BUYABLE_TILE_COUNT * MUSIC_INTENSITY_WEIGHTS.propertyOwnership
    + ownedProperties.reduce((total, property) => total + property.houses, 0)
      / BUILDABLE_LEVEL_COUNT * MUSIC_INTENSITY_WEIGHTS.development
    + clamp01(state.boardState.turnNumber / (playerCount * 12))
      * MUSIC_INTENSITY_WEIGHTS.progression
    + financialPressure * MUSIC_INTENSITY_WEIGHTS.financialPressure,
  );
}

export function deriveMusicIntensity(
  state: PublicGameState | null | undefined,
  previous: MusicIntensity = 0,
): MusicIntensity {
  if (!state?.boardState.gameStarted) return 0;
  const score = calculateMusicIntensityScore(state);
  let level: MusicIntensity = previous;
  while (level < 3 && score >= INTENSITY_THRESHOLDS[level as 0 | 1 | 2] + INTENSITY_HYSTERESIS) {
    level = (level + 1) as MusicIntensity;
  }
  while (level > 0 && score < INTENSITY_THRESHOLDS[level - 1] - INTENSITY_HYSTERESIS) {
    level = (level - 1) as MusicIntensity;
  }
  return level;
}
