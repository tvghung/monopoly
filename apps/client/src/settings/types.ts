import type { Language } from '../i18n/languages';

/** Player-facing graphics preset; `auto` resolves per device (never to `high`). */
export type GraphicsQualitySetting = 'auto' | 'high' | 'balanced' | 'low';

export interface GameSettings {
  version: 2;
  language: Language;
  masterVolume: number;
  /** Silences everything at once and keeps the volume levels for when sound comes back. */
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  animationSpeed: number;
  reducedMotion: boolean;
  fullscreen: boolean;
  graphicsQuality: GraphicsQualitySetting;
}

export type GameSettingsPatch = Partial<Omit<GameSettings, 'version'>>;

