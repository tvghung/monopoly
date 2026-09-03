import { tileState, type PublicGameState } from '@monopoly/shared';
import type { MusicIntensity } from './types';

export const MUSIC_BPM = 110;
export const MUSIC_BARS = 64;
export const MUSIC_BEATS = MUSIC_BARS * 4;
export const MUSIC_LOOP_DURATION_SECONDS = MUSIC_BEATS * 60 / MUSIC_BPM;
export const MUSIC_PHRASE_BEATS = 16;

export const GAMEPLAY_MUSIC_STEMS = [
  { id: 'foundation', url: '/audio/music/gameplay/gameplay-foundation.ogg' },
  { id: 'city', url: '/audio/music/gameplay/gameplay-city.ogg' },
  { id: 'wealth', url: '/audio/music/gameplay/gameplay-wealth.ogg' },
  { id: 'competition', url: '/audio/music/gameplay/gameplay-competition.ogg' },
] as const;

export const MUSIC_STEM_IDS = GAMEPLAY_MUSIC_STEMS.map(stem => stem.id);

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
  beatsPerBar: 4,
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
