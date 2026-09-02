import { tileState, type PublicGameState } from '@monopoly/shared';
import type { MusicIntensity } from './types';

export const MUSIC_BPM = 110;
export const MUSIC_BARS = 64;
export const MUSIC_BEATS = MUSIC_BARS * 4;
export const MUSIC_LOOP_DURATION_SECONDS = MUSIC_BEATS * 60 / MUSIC_BPM;
export const MUSIC_BUFFER_SAMPLE_RATE = 12_000;
export const MUSIC_PHRASE_BEATS = 16;
export const MUSIC_STEM_IDS = ['foundation', 'city', 'wealth', 'competition'] as const;

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

const F4 = 65;
const G4 = 67;
const A4 = 69;
const Bb4 = 70;
const C5 = 72;
const D5 = 74;
const E5 = 76;
const REST = null;

const MELODY_PHRASES = {
  intro: [REST, REST, F4, REST, REST, A4, REST, G4, REST, F4, REST, REST, REST, REST, REST, REST],
  pickup: [REST, REST, REST, REST, A4, REST, C5, D5, C5, REST, A4, G4, F4, REST, REST, REST],
  identity: [A4, REST, C5, D5, C5, REST, A4, REST, G4, F4, REST, REST, C5, A4, G4, F4],
  answer: [C5, D5, E5, REST, D5, C5, A4, REST, G4, F4, REST, REST, A4, G4, F4, REST],
  variation: [F4, A4, C5, REST, D5, C5, REST, A4, G4, REST, F4, REST, C5, A4, G4, F4],
  mischief: [C5, REST, D5, E5, REST, D5, C5, A4, REST, Bb4, A4, G4, F4, REST, REST, REST],
  descending: [E5, D5, C5, REST, Bb4, A4, G4, F4, REST, A4, C5, A4, G4, REST, F4, REST],
  competitive: [A4, C5, D5, C5, REST, E5, D5, C5, Bb4, REST, A4, G4, F4, A4, G4, REST],
  sparse: [REST, F4, REST, REST, A4, REST, G4, REST, REST, F4, REST, REST, C5, REST, G4, REST],
  turnaround: [D5, C5, A4, REST, G4, F4, REST, REST, A4, G4, F4, REST, REST, REST, REST, REST],
  silence: [REST, REST, REST, REST, REST, REST, REST, REST, REST, REST, REST, REST, REST, REST, REST, REST],
  loopPickup: [REST, REST, REST, REST, REST, REST, REST, REST, A4, REST, C5, D5, C5, G4, F4, REST],
} as const;

export const MUSIC_MAIN_MELODY_PHRASES = [
  MELODY_PHRASES.intro,
  MELODY_PHRASES.pickup,
  MELODY_PHRASES.identity,
  MELODY_PHRASES.answer,
  MELODY_PHRASES.variation,
  MELODY_PHRASES.answer,
  MELODY_PHRASES.identity,
  MELODY_PHRASES.mischief,
  MELODY_PHRASES.variation,
  MELODY_PHRASES.descending,
  MELODY_PHRASES.mischief,
  MELODY_PHRASES.answer,
  MELODY_PHRASES.descending,
  MELODY_PHRASES.turnaround,
  MELODY_PHRASES.silence,
  MELODY_PHRASES.sparse,
  MELODY_PHRASES.identity,
  MELODY_PHRASES.answer,
  MELODY_PHRASES.mischief,
  MELODY_PHRASES.descending,
  MELODY_PHRASES.competitive,
  MELODY_PHRASES.descending,
  MELODY_PHRASES.competitive,
  MELODY_PHRASES.answer,
  MELODY_PHRASES.identity,
  MELODY_PHRASES.variation,
  MELODY_PHRASES.answer,
  MELODY_PHRASES.descending,
  MELODY_PHRASES.turnaround,
  MELODY_PHRASES.sparse,
  MELODY_PHRASES.silence,
  MELODY_PHRASES.loopPickup,
] as const;

type ChordName = 'Fmaj7' | 'A7' | 'Dm7' | 'G7' | 'Gm7' | 'C7' | 'Am7' | 'D7' | 'C7/E';

const CHORDS: Record<ChordName, { bass: number; notes: readonly number[] }> = {
  Fmaj7: { bass: 41, notes: [53, 57, 60, 64] },
  A7: { bass: 45, notes: [57, 61, 64, 67] },
  Dm7: { bass: 38, notes: [50, 53, 57, 60] },
  G7: { bass: 43, notes: [55, 59, 62, 65] },
  Gm7: { bass: 43, notes: [55, 58, 62, 65] },
  C7: { bass: 36, notes: [52, 55, 58, 60] },
  Am7: { bass: 45, notes: [57, 60, 64, 67] },
  D7: { bass: 38, notes: [50, 54, 57, 60] },
  'C7/E': { bass: 40, notes: [52, 55, 58, 60] },
};

const HARMONY: readonly ChordName[] = [
  'Fmaj7', 'A7', 'Dm7', 'C7',
  'Fmaj7', 'A7', 'Dm7', 'G7', 'Gm7', 'C7', 'Am7', 'D7',
  'Gm7', 'C7', 'Fmaj7', 'D7', 'Gm7', 'C7', 'Fmaj7', 'C7',
  'Dm7', 'A7', 'Dm7', 'G7', 'Gm7', 'C7', 'Am7', 'D7',
  'Gm7', 'C7', 'Am7', 'D7',
  'Gm7', 'C7', 'Fmaj7', 'A7', 'Dm7', 'G7', 'Gm7', 'C7',
  'Am7', 'D7', 'Gm7', 'C7', 'A7', 'Dm7', 'G7', 'C7',
  'Fmaj7', 'A7', 'Dm7', 'G7', 'Gm7', 'C7', 'Am7', 'D7',
  'Dm7', 'G7', 'Gm7', 'C7', 'Am7', 'D7', 'Gm7', 'C7/E',
];

type Instrument = 'piano' | 'marimba' | 'bass' | 'clarinet' | 'trumpet' | 'pizzicato' | 'pad' | 'accordion';

const INSTRUMENTS: Record<Instrument, {
  harmonics: readonly (readonly [number, number])[];
  attack: number;
  release: number;
  decay: number;
}> = {
  piano: { harmonics: [[1, 1], [2, 0.22], [3, 0.08]], attack: 0.008, release: 0.12, decay: 1.5 },
  marimba: { harmonics: [[1, 1], [3, 0.14], [4, 0.04]], attack: 0.006, release: 0.08, decay: 4.8 },
  bass: { harmonics: [[1, 1], [2, 0.12]], attack: 0.012, release: 0.1, decay: 1.1 },
  clarinet: { harmonics: [[1, 1], [3, 0.2], [5, 0.045]], attack: 0.04, release: 0.16, decay: 0.35 },
  trumpet: { harmonics: [[1, 1], [2, 0.2], [3, 0.08]], attack: 0.035, release: 0.12, decay: 0.75 },
  pizzicato: { harmonics: [[1, 1], [2, 0.13]], attack: 0.008, release: 0.06, decay: 5.4 },
  pad: { harmonics: [[1, 1], [2, 0.07]], attack: 0.22, release: 0.32, decay: 0.08 },
  accordion: { harmonics: [[1, 1], [2, 0.11], [3, 0.055]], attack: 0.06, release: 0.18, decay: 0.4 },
};

export interface ProceduralMusicStem {
  left: Float32Array;
  right: Float32Array;
}

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

export const MUSIC_STEM_LEVELS: Readonly<Record<MusicIntensity, readonly number[]>> = {
  0: [1, 0, 0, 0],
  1: [1, 0.76, 0, 0],
  2: [1, 1, 0.72, 0],
  3: [1, 1, 1, 0.78],
};

const melodySlotCount = MUSIC_MAIN_MELODY_PHRASES.length * 16;
const activeMelodySlots = MUSIC_MAIN_MELODY_PHRASES.reduce(
  (total, phrase) => total + phrase.filter(note => note !== REST).length,
  0,
);

export const MUSIC_TRACK_METADATA = {
  bpm: MUSIC_BPM,
  beats: MUSIC_BEATS,
  bars: MUSIC_BARS,
  durationSeconds: MUSIC_LOOP_DURATION_SECONDS,
  timeSignature: '4/4',
  swing: 0.55,
  key: 'F Major',
  sections: MUSIC_SECTIONS,
  stemIds: MUSIC_STEM_IDS,
  melodicActivityRatio: activeMelodySlots / melodySlotCount,
  mainMelodyMidiRange: [F4, E5] as const,
  maxPartialFrequency: 4_800,
  approximateRmsTarget: 0.14,
  samplePeakCeiling: 0.78,
};

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

function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function swungEighthBeat(step: number): number {
  return Math.floor(step / 2) + (step % 2 === 0 ? 0 : MUSIC_TRACK_METADATA.swing);
}

function panLevels(pan: number): readonly [number, number] {
  const angle = (clamp01((pan + 1) / 2)) * Math.PI / 2;
  return [Math.cos(angle), Math.sin(angle)];
}

const noteWaveCache = new Map<string, Float32Array>();

function getNoteWave(
  sampleRate: number,
  durationBeats: number,
  midi: number,
  instrument: Instrument,
): Float32Array {
  const key = `${sampleRate}:${durationBeats}:${midi}:${instrument}`;
  const cached = noteWaveCache.get(key);
  if (cached) return cached;
  const duration = durationBeats * 60 / MUSIC_BPM;
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  const frequency = midiFrequency(midi);
  const profile = INSTRUMENTS[instrument];
  const oscillators = profile.harmonics
    .filter(([harmonic]) => frequency * harmonic <= MUSIC_TRACK_METADATA.maxPartialFrequency)
    .map(([harmonic, harmonicLevel]) => {
      const phaseStep = Math.PI * 2 * frequency * harmonic / sampleRate;
      return {
        sine: 0,
        cosine: 1,
        sineStep: Math.sin(phaseStep),
        cosineStep: Math.cos(phaseStep),
        level: harmonicLevel,
      };
    });
  const decayStep = Math.exp(-profile.decay / sampleRate);
  let decayEnvelope = 1;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, time / profile.attack);
    const release = Math.min(1, (duration - time) / profile.release);
    let tone = 0;
    for (const oscillator of oscillators) {
      tone += oscillator.sine * oscillator.level;
      const nextSine = oscillator.sine * oscillator.cosineStep
        + oscillator.cosine * oscillator.sineStep;
      oscillator.cosine = oscillator.cosine * oscillator.cosineStep
        - oscillator.sine * oscillator.sineStep;
      oscillator.sine = nextSine;
    }
    samples[index] = tone * attack * Math.max(0, release) * decayEnvelope;
    decayEnvelope *= decayStep;
  }
  noteWaveCache.set(key, samples);
  return samples;
}

function addNote(
  stem: ProceduralMusicStem,
  sampleRate: number,
  startBeat: number,
  durationBeats: number,
  midi: number,
  level: number,
  instrument: Instrument,
  pan = 0,
): void {
  const secondsPerBeat = 60 / MUSIC_BPM;
  const start = Math.max(0, Math.floor(startBeat * secondsPerBeat * sampleRate));
  const wave = getNoteWave(sampleRate, durationBeats, midi, instrument);
  const length = Math.min(wave.length, stem.left.length - start);
  const [leftLevel, rightLevel] = panLevels(pan);
  for (let offset = 0; offset < length; offset += 1) {
    const sample = wave[offset] * level;
    stem.left[start + offset] += sample * leftLevel;
    stem.right[start + offset] += sample * rightLevel;
  }
}

function addChord(
  stem: ProceduralMusicStem,
  sampleRate: number,
  startBeat: number,
  durationBeats: number,
  notes: readonly number[],
  level: number,
  instrument: Instrument,
  pan = 0,
): void {
  notes.forEach(note => addNote(
    stem,
    sampleRate,
    startBeat,
    durationBeats,
    note,
    level / notes.length,
    instrument,
    pan,
  ));
}

function addKick(stem: ProceduralMusicStem, sampleRate: number, startBeat: number, level: number): void {
  const secondsPerBeat = 60 / MUSIC_BPM;
  const start = Math.floor(startBeat * secondsPerBeat * sampleRate);
  const duration = 0.16;
  const end = Math.min(stem.left.length, start + Math.ceil(duration * sampleRate));
  for (let index = start; index < end; index += 1) {
    const time = (index - start) / sampleRate;
    const frequency = 76 - 34 * time / duration;
    const sample = Math.sin(Math.PI * 2 * frequency * time) * Math.exp(-time * 24) * level;
    stem.left[index] += sample * 0.707;
    stem.right[index] += sample * 0.707;
  }
}

function addBrush(
  stem: ProceduralMusicStem,
  sampleRate: number,
  startBeat: number,
  level: number,
  seed: number,
  pan: number,
): void {
  const secondsPerBeat = 60 / MUSIC_BPM;
  const start = Math.floor(startBeat * secondsPerBeat * sampleRate);
  const duration = 0.24;
  const end = Math.min(stem.left.length, start + Math.ceil(duration * sampleRate));
  const [leftLevel, rightLevel] = panLevels(pan);
  let random = seed >>> 0;
  let smoothed = 0;
  for (let index = start; index < end; index += 1) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const noise = random / 0xffffffff * 2 - 1;
    smoothed += (noise - smoothed) * 0.16;
    const time = (index - start) / sampleRate;
    const sample = smoothed * Math.exp(-time * 15) * level;
    stem.left[index] += sample * leftLevel;
    stem.right[index] += sample * rightLevel;
  }
}

function addFoundation(stem: ProceduralMusicStem, sampleRate: number): void {
  MUSIC_MAIN_MELODY_PHRASES.forEach((phrase, phraseIndex) => {
    phrase.forEach((note, step) => {
      if (note === REST) return;
      addNote(stem, sampleRate, phraseIndex * 8 + swungEighthBeat(step), 0.46, note, 0.078, 'piano');
    });
  });

  HARMONY.forEach((name, bar) => {
    const chord = CHORDS[name];
    const startBeat = bar * 4;
    const isBridge = bar >= 28 && bar < 32;
    addChord(stem, sampleRate, startBeat, isBridge ? 3.45 : 1.25, chord.notes, 0.082, 'piano', bar % 2 ? 0.06 : -0.06);
    if (!isBridge && bar % 4 !== 3) {
      addChord(stem, sampleRate, startBeat + (bar % 2 ? 2.5 : 2), 0.9, chord.notes, 0.054, 'piano', bar % 2 ? -0.05 : 0.05);
    }
    addNote(stem, sampleRate, startBeat, 0.82, chord.bass, 0.105, 'bass');
    addNote(stem, sampleRate, startBeat + 2, 0.68, chord.bass + 7, 0.07, 'bass');
    if ((bar >= 20 && bar < 28 || bar >= 40 && bar < 48) && bar % 2 === 1) {
      addNote(stem, sampleRate, startBeat + 3.5, 0.34, chord.bass + 2, 0.045, 'bass');
    }
    addKick(stem, sampleRate, startBeat, 0.085);
    if (bar >= 32 && bar < 48 && bar % 2 === 0) addKick(stem, sampleRate, startBeat + 2, 0.052);
    if (bar % 4 !== 3 && !isBridge) {
      addBrush(stem, sampleRate, startBeat + 1, 0.033, 91 + bar * 17, -0.08);
      addBrush(stem, sampleRate, startBeat + 3, 0.026, 137 + bar * 29, 0.08);
    }
  });
}

const MARIMBA_RESPONSES = [
  [C5, REST, A4, G4, F4, REST],
  [D5, REST, C5, A4, G4, F4],
  [A4, C5, REST, A4, G4, F4],
] as const;

function addCity(stem: ProceduralMusicStem, sampleRate: number): void {
  for (let phrase = 1; phrase < MUSIC_MAIN_MELODY_PHRASES.length; phrase += 1) {
    const bar = phrase * 2;
    const inMelodicSection = bar < 28 || bar >= 32 && bar < 56;
    if (!inMelodicSection || phrase % 2 === 0) continue;
    const response = MARIMBA_RESPONSES[phrase % MARIMBA_RESPONSES.length];
    response.forEach((note, index) => {
      if (note === REST) return;
      addNote(stem, sampleRate, phrase * 8 + 4 + swungEighthBeat(index), 0.38, note, 0.058, 'marimba', -0.14);
    });
  }

  HARMONY.forEach((name, bar) => {
    const active = bar >= 12 && bar < 20 || bar >= 32 && bar < 56;
    if (!active || bar % 3 === 2) return;
    const chord = CHORDS[name];
    [0.5, 2, 3.25].forEach((beat, index) => {
      const note = chord.notes[(bar + index) % chord.notes.length] + 12;
      addNote(stem, sampleRate, bar * 4 + beat, 0.3, note, 0.035, 'pizzicato', index % 2 ? 0.32 : -0.32);
    });
  });

  [18, 21, 23, 26, 43, 46, 50, 54].forEach((bar, index) => {
    const notes = index % 2 === 0 ? [A4, C5, A4, G4] : [C5, D5, C5, A4];
    notes.forEach((note, noteIndex) => {
      addNote(stem, sampleRate, bar * 4 + noteIndex, 0.82, note, 0.039, 'clarinet', 0.18);
    });
  });
}

function addWealth(stem: ProceduralMusicStem, sampleRate: number): void {
  HARMONY.forEach((name, bar) => {
    const chord = CHORDS[name];
    if (bar >= 28 && bar < 48 || bar >= 56) {
      addChord(stem, sampleRate, bar * 4 + 0.08, 3.7, chord.notes.map(note => note - 12), 0.032, 'pad', bar % 2 ? 0.28 : -0.28);
    }
    if (bar >= 32 && bar < 56 && bar % 2 === 0) {
      addChord(stem, sampleRate, bar * 4 + 1.5, 0.75, chord.notes, 0.038, 'piano', 0.1);
      addChord(stem, sampleRate, bar * 4 + 3, 0.55, chord.notes, 0.028, 'piano', -0.1);
    }
    if (bar >= 40 && bar < 56 && bar % 2 === 1) {
      addNote(stem, sampleRate, bar * 4 + 1.5, 0.42, chord.bass + 5, 0.038, 'bass');
    }
  });

  [38, 45, 47, 54].forEach((bar, index) => {
    addNote(stem, sampleRate, bar * 4 + 3.25, 0.46, index % 2 ? A4 : C5, 0.034, 'trumpet', 0.22);
  });
}

function addCompetition(stem: ProceduralMusicStem, sampleRate: number): void {
  HARMONY.forEach((name, bar) => {
    if (!(bar >= 40 && bar < 56) && !(bar >= 20 && bar < 28 && bar % 2 === 0)) return;
    const chord = CHORDS[name];
    addNote(stem, sampleRate, bar * 4 + 1.5, 0.38, chord.bass + 7, 0.048, 'bass', -0.04);
    addNote(stem, sampleRate, bar * 4 + 3.5, 0.3, chord.bass + (bar % 2 ? 2 : 10), 0.04, 'bass', 0.04);
    if (bar % 2 === 0) addBrush(stem, sampleRate, bar * 4 + 2.75, 0.024, 701 + bar * 31, 0.12);
  });

  [42, 46, 52, 58].forEach((bar, index) => {
    const chord = CHORDS[HARMONY[bar]];
    addChord(stem, sampleRate, bar * 4 + 2.25, 1.1, chord.notes.slice(0, 3), 0.029, 'accordion', index % 2 ? 0.2 : -0.2);
  });
}

function normalizeStems(stems: readonly ProceduralMusicStem[]): void {
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;
  const competitionGain = MUSIC_STEM_LEVELS[3][3];
  for (let channel = 0; channel < 2; channel += 1) {
    const channels = stems.map(stem => channel === 0 ? stem.left : stem.right);
    for (let index = 0; index < channels[0].length; index += 1) {
      const sample = channels[0][index] + channels[1][index] + channels[2][index]
        + channels[3][index] * competitionGain;
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
      sampleCount += 1;
    }
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  const scale = Math.min(
    MUSIC_TRACK_METADATA.samplePeakCeiling / Math.max(peak, 0.0001),
    MUSIC_TRACK_METADATA.approximateRmsTarget / Math.max(rms, 0.0001),
  );
  stems.forEach(stem => {
    for (let index = 0; index < stem.left.length; index += 1) {
      stem.left[index] *= scale;
      stem.right[index] *= scale;
    }
  });
}

export function renderProceduralMusicStems(
  stems: readonly ProceduralMusicStem[],
  sampleRate: number,
): void {
  if (stems.length !== MUSIC_STEM_IDS.length) throw new RangeError('Expected four music stems');
  const safeSampleRate = Math.max(100, Math.floor(sampleRate));
  addFoundation(stems[0], safeSampleRate);
  addCity(stems[1], safeSampleRate);
  addWealth(stems[2], safeSampleRate);
  addCompetition(stems[3], safeSampleRate);
  normalizeStems(stems);
}

export function createProceduralMusicStems(sampleRate: number): readonly ProceduralMusicStem[] {
  const safeSampleRate = Math.max(100, Math.floor(sampleRate));
  const sampleCount = Math.max(1, Math.floor(safeSampleRate * MUSIC_LOOP_DURATION_SECONDS));
  const stems = MUSIC_STEM_IDS.map(() => ({
    left: new Float32Array(sampleCount),
    right: new Float32Array(sampleCount),
  }));
  renderProceduralMusicStems(stems, safeSampleRate);
  return stems;
}
