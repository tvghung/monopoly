import type { GameSettings } from './types';

export const SETTINGS_STORAGE_KEY = 'own-the-block.settings.v1';
export const ANIMATION_SPEED_OPTIONS = [0.75, 1, 1.5, 2] as const;

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  version: 1,
  masterVolume: 1,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  animationSpeed: 1,
  reducedMotion: false,
  fullscreen: false,
};

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function clampVolume(value: unknown, fallback: number): number {
  return validNumber(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function normalizeAnimationSpeed(value: unknown): number {
  return validNumber(value) && ANIMATION_SPEED_OPTIONS.includes(value as typeof ANIMATION_SPEED_OPTIONS[number])
    ? value
    : DEFAULT_GAME_SETTINGS.animationSpeed;
}

export function normalizeSettings(value: unknown): GameSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GAME_SETTINGS };
  const candidate = value as Partial<GameSettings>;
  return {
    version: 1,
    masterVolume: clampVolume(candidate.masterVolume, DEFAULT_GAME_SETTINGS.masterVolume),
    musicVolume: clampVolume(candidate.musicVolume, DEFAULT_GAME_SETTINGS.musicVolume),
    sfxVolume: clampVolume(candidate.sfxVolume, DEFAULT_GAME_SETTINGS.sfxVolume),
    animationSpeed: normalizeAnimationSpeed(candidate.animationSpeed),
    reducedMotion: typeof candidate.reducedMotion === 'boolean'
      ? candidate.reducedMotion
      : DEFAULT_GAME_SETTINGS.reducedMotion,
    fullscreen: typeof candidate.fullscreen === 'boolean'
      ? candidate.fullscreen
      : DEFAULT_GAME_SETTINGS.fullscreen,
  };
}

