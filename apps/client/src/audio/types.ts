export interface AudioMix {
  masterGain: number;
  musicGain: number;
  sfxGain: number;
}

export type MusicIntensity = 0 | 1 | 2 | 3;

export type AudioCueId =
  | 'ui.click'
  | 'dice.shake'
  | 'dice.impact'
  | 'movement.hop'
  | 'movement.land'
  | 'money.receive'
  | 'money.pay'
  | 'money.transfer'
  | 'property.purchase'
  | 'property.release'
  | 'property.transfer'
  | 'property.change'
  | 'build.house'
  | 'build.hotel'
  | 'build.remove'
  | 'card.draw'
  | 'card.reveal'
  | 'jail.enter'
  | 'jail.failed'
  | 'jail.release'
  | 'bankruptcy'
  | 'victory';

export type AudioVoiceScope = 'presentation' | 'ui';

export interface AudioPlayOptions {
  signal?: AbortSignal;
  gain?: number;
  scope?: AudioVoiceScope;
}

export interface AudioPort {
  play: (cueId: AudioCueId, options?: AudioPlayOptions) => void;
  handleUserInteraction: (cueId?: AudioCueId) => void;
  stopPresentationVoices?: () => void;
  setRoomActive?: (active: boolean) => void;
  setDocumentHidden?: (hidden: boolean) => void;
  setMusicIntensity?: (intensity: MusicIntensity) => void;
}

export const NOOP_AUDIO_PORT: AudioPort = Object.freeze({
  play: () => {},
  handleUserInteraction: () => {},
  stopPresentationVoices: () => {},
  setRoomActive: () => {},
  setDocumentHidden: () => {},
  setMusicIntensity: () => {},
});

