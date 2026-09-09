import { describe, expect, it } from 'vitest';
import {
  calculateMusicSegmentBoundaries,
  GAMEPLAY_MUSIC_STEMS,
  MUSIC_BPM,
  MUSIC_BARS,
  MUSIC_MANIFEST_URL,
  MUSIC_SEGMENT_COUNT,
  MUSIC_TOTAL_SOURCE_FRAMES,
  isSafeGameplayMusicSegmentPath,
  parseGameplayMusicManifest,
} from './music';

function validManifest(): Record<string, unknown> {
  const boundaries = calculateMusicSegmentBoundaries();
  const last = boundaries.at(-1)!;
  return {
    schemaVersion: 1,
    track: {
      bpm: MUSIC_BPM,
      beatsPerBar: 4,
      bars: MUSIC_BARS,
      segmentBars: 4,
      segmentCount: MUSIC_SEGMENT_COUNT,
      sampleRate: 48_000,
      totalFrames: last.startFrame + last.frameCount,
    },
    stems: GAMEPLAY_MUSIC_STEMS.map(stem => ({
      id: stem.id,
      segments: boundaries.map(segment => ({
        ...segment,
        file: `segments/${stem.id}/${String(segment.index).padStart(2, '0')}.ogg`,
        sha256: '',
      })),
    })),
  };
}

interface MutableSegment {
  index: number;
  file: string;
  startFrame: number;
  frameCount: number;
  sha256: string;
}

interface MutableManifest {
  schemaVersion: number;
  track: {
    bpm: number;
    beatsPerBar: number;
    bars: number;
    segmentBars: number;
    segmentCount: number;
    sampleRate: number;
    totalFrames: number;
  };
  stems: Array<{ id: string; segments: MutableSegment[] }>;
}

function cloneManifest(): MutableManifest {
  return JSON.parse(JSON.stringify(validManifest())) as MutableManifest;
}

describe('segmented gameplay music manifest', () => {
  it('validates the source timeline and cumulative phrase boundaries', () => {
    const manifest = parseGameplayMusicManifest(validManifest());
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.track.totalFrames).toBe(MUSIC_TOTAL_SOURCE_FRAMES);
    expect(manifest.stems).toHaveLength(4);
    expect(manifest.stems.every(stem => stem.segments.length === 16)).toBe(true);
    expect(manifest.stems[0]?.segments[0]?.startFrame).toBe(0);
    expect(manifest.stems[0]?.segments[15]?.startFrame).toBe(
      calculateMusicSegmentBoundaries()[15]?.startFrame,
    );
  });

  const invalidCases: Array<[string, (manifest: MutableManifest) => void]> = [
    ['schema version', manifest => { manifest.schemaVersion = 2; }],
    ['BPM', manifest => { manifest.track.bpm = 120; }],
    ['bar count', manifest => { manifest.track.bars = 32; }],
    ['segment count', manifest => { manifest.track.segmentCount = 8; }],
    ['missing stem', manifest => { manifest.stems.pop(); }],
    ['duplicate stem', manifest => { manifest.stems[1].id = 'foundation'; }],
    ['wrong stem ID', manifest => { manifest.stems[0].id = 'strings'; }],
    ['duplicate segment', manifest => { manifest.stems[0].segments[1].index = 0; }],
    ['missing segment', manifest => { manifest.stems[0].segments.pop(); }],
    ['non-contiguous frame range', manifest => { manifest.stems[0].segments[4].startFrame += 1; }],
    ['negative frame value', manifest => { manifest.stems[0].segments[4].startFrame = -1; }],
    ['zero frame count', manifest => { manifest.stems[0].segments[4].frameCount = 0; }],
    ['wrong total frame count', manifest => { manifest.track.totalFrames += 1; }],
    ['unsafe external URL', manifest => { manifest.stems[0].segments[0].file = 'https://external.example/music.ogg'; }],
    ['unsafe traversal path', manifest => { manifest.stems[0].segments[0].file = 'segments/foundation/../00.ogg'; }],
    ['invalid SHA-256', manifest => { manifest.stems[0].segments[0].sha256 = 'not-a-hash'; }],
    ['cross-stem timeline mismatch', manifest => { manifest.stems[1].segments[0].frameCount += 1; }],
  ];

  it.each(invalidCases)('rejects %s', (_name, mutate) => {
    const manifest = cloneManifest();
    mutate(manifest);
    expect(() => parseGameplayMusicManifest(manifest)).toThrow(/Invalid gameplay music manifest/);
  });

  it('rejects paths outside the local gameplay asset root', () => {
    expect(isSafeGameplayMusicSegmentPath('segments/foundation/00.ogg', 'foundation')).toBe(true);
    expect(isSafeGameplayMusicSegmentPath('../foundation.ogg', 'foundation')).toBe(false);
    expect(isSafeGameplayMusicSegmentPath('segments/foundation/../00.ogg', 'foundation')).toBe(false);
    expect(isSafeGameplayMusicSegmentPath('file://music/foundation.ogg', 'foundation')).toBe(false);
    expect(isSafeGameplayMusicSegmentPath('segments/city/00.ogg', 'foundation')).toBe(false);
    expect(MUSIC_MANIFEST_URL.startsWith('/audio/music/gameplay/')).toBe(true);
  });

  it('normalizes accepted stem records to the deterministic runtime order', () => {
    const manifest = validManifest();
    (manifest.stems as Array<Record<string, unknown>>).reverse();
    expect(parseGameplayMusicManifest(manifest).stems.map(stem => stem.id))
      .toEqual(['foundation', 'city', 'wealth', 'competition']);
  });
});
