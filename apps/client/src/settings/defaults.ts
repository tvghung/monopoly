import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../i18n/languages';
import type { FpsLimitSetting, GameSettings, GraphicsQualitySetting } from './types';

export const SETTINGS_STORAGE_KEY = 'own-the-block.settings.v3';
export const PREVIOUS_SETTINGS_STORAGE_KEY = 'own-the-block.settings.v2';
export const LEGACY_SETTINGS_STORAGE_KEY = 'own-the-block.settings.v1';
export const ANIMATION_SPEED_OPTIONS = [0.75, 1, 1.5, 2] as const;
export const GRAPHICS_QUALITY_OPTIONS = ['auto', 'high', 'balanced', 'low'] as const satisfies readonly GraphicsQualitySetting[];
export const FPS_LIMIT_OPTIONS = [30, 60, 120, 180, 240] as const satisfies readonly FpsLimitSetting[];

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  version: 3,
  language: DEFAULT_LANGUAGE,
  masterVolume: 1,
  muted: false,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  animationSpeed: 1,
  reducedMotion: false,
  fullscreen: false,
  graphicsQuality: 'balanced',
  fpsLimit: 60,
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

export function normalizeGraphicsQuality(value: unknown): GraphicsQualitySetting {
  return typeof value === 'string' && (GRAPHICS_QUALITY_OPTIONS as readonly string[]).includes(value)
    ? value as GraphicsQualitySetting
    : DEFAULT_GAME_SETTINGS.graphicsQuality;
}

export function normalizeFpsLimit(value: unknown): FpsLimitSetting {
  return typeof value === 'number' && (FPS_LIMIT_OPTIONS as readonly number[]).includes(value)
    ? value as FpsLimitSetting
    : DEFAULT_GAME_SETTINGS.fpsLimit;
}

export function normalizeSettings(value: unknown): GameSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GAME_SETTINGS };
  const candidate = value as Partial<GameSettings>;
  return {
    version: 3,
    language: isSupportedLanguage(candidate.language) ? candidate.language : DEFAULT_GAME_SETTINGS.language,
    masterVolume: clampVolume(candidate.masterVolume, DEFAULT_GAME_SETTINGS.masterVolume),
    muted: typeof candidate.muted === 'boolean' ? candidate.muted : DEFAULT_GAME_SETTINGS.muted,
    musicVolume: clampVolume(candidate.musicVolume, DEFAULT_GAME_SETTINGS.musicVolume),
    sfxVolume: clampVolume(candidate.sfxVolume, DEFAULT_GAME_SETTINGS.sfxVolume),
    animationSpeed: normalizeAnimationSpeed(candidate.animationSpeed),
    reducedMotion: typeof candidate.reducedMotion === 'boolean'
      ? candidate.reducedMotion
      : DEFAULT_GAME_SETTINGS.reducedMotion,
    fullscreen: typeof candidate.fullscreen === 'boolean'
      ? candidate.fullscreen
      : DEFAULT_GAME_SETTINGS.fullscreen,
    graphicsQuality: normalizeGraphicsQuality(candidate.graphicsQuality),
    fpsLimit: normalizeFpsLimit(candidate.fpsLimit),
  };
}

