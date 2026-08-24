import { createContext, useEffect, useState, type ReactNode } from 'react';
import { useSettings } from '../settings/selectors';
import { AudioEngine } from './AudioEngine';
import { NOOP_AUDIO_PORT, type AudioPort } from './types';

export const audioContext = createContext<AudioPort>(NOOP_AUDIO_PORT);

export function handleAudioButtonClick(event: MouseEvent, audio: AudioPort): void {
  if (!event.isTrusted || !(event.target instanceof Element)) return;
  const button = event.target.closest('button');
  if (!(button instanceof HTMLButtonElement)
    || button.disabled
    || button.getAttribute('aria-disabled') === 'true'
    || button.dataset.audioClick === 'off') return;
  audio.handleUserInteraction('ui.click');
}

export function attachAudioInteractionListeners(target: Document, audio: AudioPort): () => void {
  const unlock = (event: Event) => {
    if (event.isTrusted) audio.handleUserInteraction();
  };
  const click = (event: MouseEvent) => handleAudioButtonClick(event, audio);
  target.addEventListener('pointerdown', unlock, true);
  target.addEventListener('keydown', unlock, true);
  target.addEventListener('click', click, true);
  return () => {
    target.removeEventListener('pointerdown', unlock, true);
    target.removeEventListener('keydown', unlock, true);
    target.removeEventListener('click', click, true);
  };
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [audio] = useState(() => new AudioEngine());

  useEffect(() => {
    audio.setMix({
      masterGain: settings.masterVolume,
      musicGain: settings.musicVolume,
      sfxGain: settings.sfxVolume,
    });
  }, [audio, settings.masterVolume, settings.musicVolume, settings.sfxVolume]);

  useEffect(() => {
    audio.retain();
    const detach = attachAudioInteractionListeners(document, audio);
    return () => {
      detach();
      audio.release();
    };
  }, [audio]);

  return <audioContext.Provider value={audio}>{children}</audioContext.Provider>;
}

