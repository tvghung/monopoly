/** Player-facing graphics preset; `auto` resolves per device (never to `high`). */
export type GraphicsQualitySetting = 'auto' | 'high' | 'balanced' | 'low';

export interface GameSettings {
  version: 1;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  animationSpeed: number;
  reducedMotion: boolean;
  fullscreen: boolean;
  graphicsQuality: GraphicsQualitySetting;
}

export type GameSettingsPatch = Partial<Omit<GameSettings, 'version'>>;

