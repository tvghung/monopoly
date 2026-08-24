export interface AudioMix {
  masterGain: number;
  musicGain: number;
  sfxGain: number;
}

export type AudioCueId =
  | 'ui.click'
  | 'dice.shake'
  | 'dice.impact'
  | 'movement.hop'
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
  | 'card.reveal'
  | 'jail.enter'
  | 'jail.failed'
  | 'jail.release'
  | 'bankruptcy'
  | 'victory';

export interface AudioPlayOptions {
  signal?: AbortSignal;
  gain?: number;
}

export interface AudioPort {
  play: (cueId: AudioCueId, options?: AudioPlayOptions) => void;
  handleUserInteraction: (cueId?: AudioCueId) => void;
}

export const NOOP_AUDIO_PORT: AudioPort = Object.freeze({
  play: () => {},
  handleUserInteraction: () => {},
});

