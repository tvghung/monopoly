import type { AudioCueId } from './types';

interface ToneLayer {
  kind: 'tone';
  waveform: OscillatorType;
  frequency: number;
  endFrequency?: number;
  offsetMs?: number;
  durationMs: number;
  attackMs?: number;
  level: number;
}

interface NoiseLayer {
  kind: 'noise';
  offsetMs?: number;
  durationMs: number;
  attackMs?: number;
  level: number;
}

export type ProceduralAudioLayer = ToneLayer | NoiseLayer;

export interface ProceduralAudioSource {
  kind: 'procedural';
  layers: readonly ProceduralAudioLayer[];
}

export interface SampleAudioSource {
  kind: 'sample';
  files: readonly string[];
  proceduralFallback: ProceduralAudioSource;
}

export type AudioSource = ProceduralAudioSource | SampleAudioSource;

export interface AudioCueDefinition {
  family:
    | 'UI'
    | 'Dice'
    | 'Movement'
    | 'Money'
    | 'Property'
    | 'Build'
    | 'Card'
    | 'Jail'
    | 'Bankruptcy'
    | 'Victory';
  bus: 'sfx';
  gain: number;
  cooldownMs: number;
  maxVoices: number;
  source: AudioSource;
}

export function publicAudioAsset(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}

export const GAMEPLAY_MUSIC_URL = publicAudioAsset(
  'audio/music/own-the-block-main-theme-loop.wav',
);

const procedural = (layers: readonly ProceduralAudioLayer[]): ProceduralAudioSource => ({
  kind: 'procedural',
  layers,
});

const sample = (
  files: readonly string[],
  fallback: readonly ProceduralAudioLayer[],
): SampleAudioSource => ({
  kind: 'sample',
  files: files.map(file => publicAudioAsset(`audio/${file}`)),
  proceduralFallback: procedural(fallback),
});

export const AUDIO_REGISTRY = {
  'ui.click': {
    family: 'UI', bus: 'sfx', gain: 0.12, cooldownMs: 45, maxVoices: 2,
    source: procedural([
      { kind: 'tone', waveform: 'sine', frequency: 720, endFrequency: 540, durationMs: 34, attackMs: 3, level: 0.7 },
    ]),
  },
  'dice.shake': {
    family: 'Dice', bus: 'sfx', gain: 0.095, cooldownMs: 180, maxVoices: 1,
    source: sample([
      'sfx/dice/dice-shake-01.ogg',
      'sfx/dice/dice-shake-02.ogg',
      'sfx/dice/dice-shake-03.ogg',
    ], [
      { kind: 'noise', durationMs: 180, attackMs: 8, level: 0.32 },
      { kind: 'tone', waveform: 'triangle', frequency: 115, endFrequency: 150, durationMs: 180, attackMs: 8, level: 0.18 },
    ]),
  },
  'dice.impact': {
    family: 'Dice', bus: 'sfx', gain: 0.15, cooldownMs: 90, maxVoices: 2,
    source: sample([
      'sfx/dice/dice-impact-01.ogg',
      'sfx/dice/dice-impact-02.ogg',
      'sfx/dice/dice-impact-03.ogg',
    ], [
      { kind: 'noise', durationMs: 48, attackMs: 2, level: 0.36 },
      { kind: 'tone', waveform: 'sine', frequency: 150, endFrequency: 74, durationMs: 105, attackMs: 2, level: 0.72 },
    ]),
  },
  'movement.hop': {
    family: 'Movement', bus: 'sfx', gain: 0.065, cooldownMs: 58, maxVoices: 1,
    source: procedural([
      { kind: 'tone', waveform: 'sine', frequency: 390, endFrequency: 245, durationMs: 42, attackMs: 2, level: 0.62 },
    ]),
  },
  'movement.land': {
    family: 'Movement', bus: 'sfx', gain: 0.105, cooldownMs: 90, maxVoices: 1,
    source: sample([
      'sfx/movement/movement-land-01.ogg',
      'sfx/movement/movement-land-02.ogg',
      'sfx/movement/movement-land-03.ogg',
    ], [
      { kind: 'noise', durationMs: 34, attackMs: 1, level: 0.22 },
      { kind: 'tone', waveform: 'triangle', frequency: 280, endFrequency: 165, durationMs: 78, attackMs: 2, level: 0.68 },
    ]),
  },
  'money.receive': {
    family: 'Money', bus: 'sfx', gain: 0.105, cooldownMs: 100, maxVoices: 2,
    source: sample([
      'sfx/money/money-receive-01.ogg',
      'sfx/money/money-receive-02.ogg',
      'sfx/money/money-receive-03.ogg',
    ], [
      { kind: 'tone', waveform: 'sine', frequency: 660, durationMs: 105, attackMs: 4, level: 0.55 },
      { kind: 'tone', waveform: 'sine', frequency: 880, offsetMs: 72, durationMs: 135, attackMs: 4, level: 0.62 },
    ]),
  },
  'money.pay': {
    family: 'Money', bus: 'sfx', gain: 0.085, cooldownMs: 100, maxVoices: 2,
    source: sample(['sfx/money/money-pay-01.ogg'], [
      { kind: 'tone', waveform: 'sine', frequency: 520, durationMs: 95, attackMs: 4, level: 0.5 },
      { kind: 'tone', waveform: 'sine', frequency: 360, offsetMs: 65, durationMs: 125, attackMs: 4, level: 0.58 },
    ]),
  },
  'money.transfer': {
    family: 'Money', bus: 'sfx', gain: 0.11, cooldownMs: 100, maxVoices: 2,
    source: procedural([
      { kind: 'tone', waveform: 'triangle', frequency: 470, endFrequency: 610, durationMs: 135, attackMs: 5, level: 0.5 },
      { kind: 'tone', waveform: 'sine', frequency: 720, offsetMs: 92, durationMs: 95, attackMs: 4, level: 0.4 },
    ]),
  },
  'property.purchase': {
    family: 'Property', bus: 'sfx', gain: 0.095, cooldownMs: 120, maxVoices: 2,
    source: sample([
      'sfx/property/property-purchase-01.ogg',
      'sfx/property/property-purchase-02.ogg',
    ], [
      { kind: 'tone', waveform: 'triangle', frequency: 330, durationMs: 100, attackMs: 4, level: 0.45 },
      { kind: 'tone', waveform: 'sine', frequency: 660, offsetMs: 75, durationMs: 150, attackMs: 5, level: 0.62 },
    ]),
  },
  'property.release': {
    family: 'Property', bus: 'sfx', gain: 0.09, cooldownMs: 120, maxVoices: 1,
    source: procedural([
      { kind: 'tone', waveform: 'triangle', frequency: 440, endFrequency: 270, durationMs: 150, attackMs: 4, level: 0.48 },
    ]),
  },
  'property.transfer': {
    family: 'Property', bus: 'sfx', gain: 0.11, cooldownMs: 120, maxVoices: 2,
    source: procedural([
      { kind: 'tone', waveform: 'triangle', frequency: 360, endFrequency: 520, durationMs: 145, attackMs: 4, level: 0.5 },
    ]),
  },
  'property.change': {
    family: 'Property', bus: 'sfx', gain: 0.08, cooldownMs: 120, maxVoices: 1,
    source: procedural([
      { kind: 'tone', waveform: 'sine', frequency: 420, endFrequency: 500, durationMs: 105, attackMs: 4, level: 0.42 },
    ]),
  },
  'build.house': {
    family: 'Build', bus: 'sfx', gain: 0.1, cooldownMs: 45, maxVoices: 2,
    source: sample([
      'sfx/build/build-house-01.ogg',
      'sfx/build/build-house-02.ogg',
    ], [
      { kind: 'noise', durationMs: 35, attackMs: 1, level: 0.22 },
      { kind: 'tone', waveform: 'triangle', frequency: 210, endFrequency: 560, durationMs: 76, attackMs: 2, level: 0.68 },
    ]),
  },
  'build.hotel': {
    family: 'Build', bus: 'sfx', gain: 0.115, cooldownMs: 160, maxVoices: 1,
    source: sample([
      'sfx/build/build-hotel-01.ogg',
      'sfx/build/build-hotel-02.ogg',
    ], [
      { kind: 'tone', waveform: 'triangle', frequency: 260, durationMs: 120, attackMs: 4, level: 0.48 },
      { kind: 'tone', waveform: 'sine', frequency: 520, offsetMs: 80, durationMs: 130, attackMs: 4, level: 0.56 },
      { kind: 'tone', waveform: 'sine', frequency: 780, offsetMs: 155, durationMs: 165, attackMs: 5, level: 0.62 },
    ]),
  },
  'build.remove': {
    family: 'Build', bus: 'sfx', gain: 0.075, cooldownMs: 90, maxVoices: 1,
    source: procedural([
      { kind: 'tone', waveform: 'triangle', frequency: 380, endFrequency: 210, durationMs: 125, attackMs: 3, level: 0.46 },
    ]),
  },
  'card.draw': {
    family: 'Card', bus: 'sfx', gain: 0.085, cooldownMs: 180, maxVoices: 1,
    source: sample([
      'sfx/card/card-draw-01.ogg',
      'sfx/card/card-draw-02.ogg',
      'sfx/card/card-draw-03.ogg',
    ], [
      { kind: 'noise', durationMs: 42, attackMs: 2, level: 0.2 },
      { kind: 'tone', waveform: 'triangle', frequency: 300, endFrequency: 470, durationMs: 92, attackMs: 3, level: 0.52 },
    ]),
  },
  'card.reveal': {
    family: 'Card', bus: 'sfx', gain: 0.1, cooldownMs: 180, maxVoices: 1,
    source: sample([
      'sfx/card/card-reveal-01.ogg',
      'sfx/card/card-reveal-02.ogg',
    ], [
      { kind: 'noise', durationMs: 115, attackMs: 8, level: 0.2 },
      { kind: 'tone', waveform: 'sine', frequency: 420, endFrequency: 820, durationMs: 185, attackMs: 8, level: 0.52 },
    ]),
  },
  'jail.enter': {
    family: 'Jail', bus: 'sfx', gain: 0.12, cooldownMs: 180, maxVoices: 1,
    source: sample(['sfx/jail/jail-enter-01.ogg'], [
      { kind: 'tone', waveform: 'square', frequency: 220, endFrequency: 170, durationMs: 135, attackMs: 2, level: 0.38 },
      { kind: 'tone', waveform: 'sine', frequency: 880, offsetMs: 26, durationMs: 125, attackMs: 2, level: 0.32 },
    ]),
  },
  'jail.failed': {
    family: 'Jail', bus: 'sfx', gain: 0.09, cooldownMs: 150, maxVoices: 1,
    source: procedural([
      { kind: 'tone', waveform: 'triangle', frequency: 250, endFrequency: 180, durationMs: 150, attackMs: 4, level: 0.46 },
    ]),
  },
  'jail.release': {
    family: 'Jail', bus: 'sfx', gain: 0.1, cooldownMs: 150, maxVoices: 1,
    source: sample(['sfx/jail/jail-release-01.ogg'], [
      { kind: 'tone', waveform: 'sine', frequency: 330, durationMs: 90, attackMs: 3, level: 0.42 },
      { kind: 'tone', waveform: 'sine', frequency: 660, offsetMs: 58, durationMs: 140, attackMs: 4, level: 0.55 },
    ]),
  },
  bankruptcy: {
    family: 'Bankruptcy', bus: 'sfx', gain: 0.105, cooldownMs: 300, maxVoices: 1,
    source: sample(['sfx/bankruptcy/bankruptcy-01.ogg'], [
      { kind: 'tone', waveform: 'triangle', frequency: 330, durationMs: 125, attackMs: 5, level: 0.48 },
      { kind: 'tone', waveform: 'triangle', frequency: 220, offsetMs: 92, durationMs: 170, attackMs: 5, level: 0.52 },
      { kind: 'tone', waveform: 'sine', frequency: 130, offsetMs: 190, durationMs: 220, attackMs: 5, level: 0.56 },
    ]),
  },
  victory: {
    family: 'Victory', bus: 'sfx', gain: 0.15, cooldownMs: 500, maxVoices: 1,
    source: procedural([
      { kind: 'tone', waveform: 'sine', frequency: 392, durationMs: 150, attackMs: 5, level: 0.48 },
      { kind: 'tone', waveform: 'sine', frequency: 523.25, offsetMs: 105, durationMs: 170, attackMs: 5, level: 0.5 },
      { kind: 'tone', waveform: 'sine', frequency: 659.25, offsetMs: 215, durationMs: 220, attackMs: 5, level: 0.57 },
    ]),
  },
} as const satisfies Record<AudioCueId, AudioCueDefinition>;
