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
  source: {
    kind: 'procedural';
    layers: readonly ProceduralAudioLayer[];
  };
}

export const AUDIO_REGISTRY = {
  'ui.click': {
    family: 'UI', bus: 'sfx', gain: 0.12, cooldownMs: 45, maxVoices: 2,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'sine', frequency: 720, endFrequency: 540, durationMs: 34, attackMs: 3, level: 0.7 },
    ] },
  },
  'dice.shake': {
    family: 'Dice', bus: 'sfx', gain: 0.11, cooldownMs: 180, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'noise', durationMs: 180, attackMs: 8, level: 0.32 },
      { kind: 'tone', waveform: 'triangle', frequency: 115, endFrequency: 150, durationMs: 180, attackMs: 8, level: 0.18 },
    ] },
  },
  'dice.impact': {
    family: 'Dice', bus: 'sfx', gain: 0.18, cooldownMs: 90, maxVoices: 2,
    source: { kind: 'procedural', layers: [
      { kind: 'noise', durationMs: 48, attackMs: 2, level: 0.36 },
      { kind: 'tone', waveform: 'sine', frequency: 150, endFrequency: 74, durationMs: 105, attackMs: 2, level: 0.72 },
    ] },
  },
  'movement.hop': {
    family: 'Movement', bus: 'sfx', gain: 0.065, cooldownMs: 58, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'sine', frequency: 390, endFrequency: 245, durationMs: 42, attackMs: 2, level: 0.62 },
    ] },
  },
  'money.receive': {
    family: 'Money', bus: 'sfx', gain: 0.14, cooldownMs: 100, maxVoices: 2,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'sine', frequency: 660, durationMs: 105, attackMs: 4, level: 0.55 },
      { kind: 'tone', waveform: 'sine', frequency: 880, offsetMs: 72, durationMs: 135, attackMs: 4, level: 0.62 },
    ] },
  },
  'money.pay': {
    family: 'Money', bus: 'sfx', gain: 0.12, cooldownMs: 100, maxVoices: 2,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'sine', frequency: 520, durationMs: 95, attackMs: 4, level: 0.5 },
      { kind: 'tone', waveform: 'sine', frequency: 360, offsetMs: 65, durationMs: 125, attackMs: 4, level: 0.58 },
    ] },
  },
  'money.transfer': {
    family: 'Money', bus: 'sfx', gain: 0.11, cooldownMs: 100, maxVoices: 2,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'triangle', frequency: 470, endFrequency: 610, durationMs: 135, attackMs: 5, level: 0.5 },
      { kind: 'tone', waveform: 'sine', frequency: 720, offsetMs: 92, durationMs: 95, attackMs: 4, level: 0.4 },
    ] },
  },
  'property.purchase': {
    family: 'Property', bus: 'sfx', gain: 0.14, cooldownMs: 120, maxVoices: 2,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'triangle', frequency: 330, durationMs: 100, attackMs: 4, level: 0.45 },
      { kind: 'tone', waveform: 'sine', frequency: 660, offsetMs: 75, durationMs: 150, attackMs: 5, level: 0.62 },
    ] },
  },
  'property.release': {
    family: 'Property', bus: 'sfx', gain: 0.09, cooldownMs: 120, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'triangle', frequency: 440, endFrequency: 270, durationMs: 150, attackMs: 4, level: 0.48 },
    ] },
  },
  'property.transfer': {
    family: 'Property', bus: 'sfx', gain: 0.11, cooldownMs: 120, maxVoices: 2,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'triangle', frequency: 360, endFrequency: 520, durationMs: 145, attackMs: 4, level: 0.5 },
    ] },
  },
  'property.change': {
    family: 'Property', bus: 'sfx', gain: 0.08, cooldownMs: 120, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'sine', frequency: 420, endFrequency: 500, durationMs: 105, attackMs: 4, level: 0.42 },
    ] },
  },
  'build.house': {
    family: 'Build', bus: 'sfx', gain: 0.105, cooldownMs: 72, maxVoices: 2,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'sine', frequency: 250, endFrequency: 510, durationMs: 92, attackMs: 3, level: 0.58 },
    ] },
  },
  'build.hotel': {
    family: 'Build', bus: 'sfx', gain: 0.14, cooldownMs: 160, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'triangle', frequency: 260, durationMs: 120, attackMs: 4, level: 0.48 },
      { kind: 'tone', waveform: 'sine', frequency: 520, offsetMs: 80, durationMs: 130, attackMs: 4, level: 0.56 },
      { kind: 'tone', waveform: 'sine', frequency: 780, offsetMs: 155, durationMs: 165, attackMs: 5, level: 0.62 },
    ] },
  },
  'build.remove': {
    family: 'Build', bus: 'sfx', gain: 0.075, cooldownMs: 90, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'triangle', frequency: 380, endFrequency: 210, durationMs: 125, attackMs: 3, level: 0.46 },
    ] },
  },
  'card.reveal': {
    family: 'Card', bus: 'sfx', gain: 0.105, cooldownMs: 180, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'noise', durationMs: 115, attackMs: 12, level: 0.15 },
      { kind: 'tone', waveform: 'sine', frequency: 420, endFrequency: 760, durationMs: 170, attackMs: 10, level: 0.4 },
    ] },
  },
  'jail.enter': {
    family: 'Jail', bus: 'sfx', gain: 0.16, cooldownMs: 180, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'square', frequency: 220, endFrequency: 170, durationMs: 135, attackMs: 2, level: 0.38 },
      { kind: 'tone', waveform: 'sine', frequency: 880, offsetMs: 26, durationMs: 125, attackMs: 2, level: 0.32 },
    ] },
  },
  'jail.failed': {
    family: 'Jail', bus: 'sfx', gain: 0.09, cooldownMs: 150, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'triangle', frequency: 250, endFrequency: 180, durationMs: 150, attackMs: 4, level: 0.46 },
    ] },
  },
  'jail.release': {
    family: 'Jail', bus: 'sfx', gain: 0.11, cooldownMs: 150, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'sine', frequency: 330, durationMs: 90, attackMs: 3, level: 0.42 },
      { kind: 'tone', waveform: 'sine', frequency: 660, offsetMs: 58, durationMs: 140, attackMs: 4, level: 0.55 },
    ] },
  },
  bankruptcy: {
    family: 'Bankruptcy', bus: 'sfx', gain: 0.13, cooldownMs: 300, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'triangle', frequency: 330, durationMs: 125, attackMs: 5, level: 0.48 },
      { kind: 'tone', waveform: 'triangle', frequency: 220, offsetMs: 92, durationMs: 170, attackMs: 5, level: 0.52 },
      { kind: 'tone', waveform: 'sine', frequency: 130, offsetMs: 190, durationMs: 220, attackMs: 5, level: 0.56 },
    ] },
  },
  victory: {
    family: 'Victory', bus: 'sfx', gain: 0.15, cooldownMs: 500, maxVoices: 1,
    source: { kind: 'procedural', layers: [
      { kind: 'tone', waveform: 'sine', frequency: 392, durationMs: 150, attackMs: 5, level: 0.48 },
      { kind: 'tone', waveform: 'sine', frequency: 523.25, offsetMs: 105, durationMs: 170, attackMs: 5, level: 0.5 },
      { kind: 'tone', waveform: 'sine', frequency: 659.25, offsetMs: 215, durationMs: 220, attackMs: 5, level: 0.57 },
    ] },
  },
} as const satisfies Record<AudioCueId, AudioCueDefinition>;
