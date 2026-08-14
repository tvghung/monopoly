export interface GameSettings {
  version: 1;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  animationSpeed: number;
  reducedMotion: boolean;
  fullscreen: boolean;
}

export type GameSettingsPatch = Partial<Omit<GameSettings, 'version'>>;

