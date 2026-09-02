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

export function handleAudioPointerInteraction(event: PointerEvent, audio: AudioPort): void {
  if (!event.isTrusted) return;
  const isActivationEvent = event.pointerType === 'mouse'
    ? event.type === 'pointerdown'
    : event.type === 'pointerup';
  if (isActivationEvent) audio.handleUserInteraction();
}

export function handleAudioKeyDown(event: KeyboardEvent, audio: AudioPort): void {
  if (event.isTrusted) audio.handleUserInteraction();
}

export function attachAudioInteractionListeners(target: Document, audio: AudioPort): () => void {
  const pointer = (event: PointerEvent) => handleAudioPointerInteraction(event, audio);
  const keydown = (event: KeyboardEvent) => handleAudioKeyDown(event, audio);
  const click = (event: MouseEvent) => handleAudioButtonClick(event, audio);
  target.addEventListener('pointerdown', pointer, true);
  target.addEventListener('pointerup', pointer, true);
  target.addEventListener('keydown', keydown, true);
  target.addEventListener('click', click, true);
  return () => {
    target.removeEventListener('pointerdown', pointer, true);
    target.removeEventListener('pointerup', pointer, true);
    target.removeEventListener('keydown', keydown, true);
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

  useEffect(() => {
    const updateVisibility = () => {
      audio.setDocumentHidden?.(document.visibilityState === 'hidden');
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, [audio]);

  return <audioContext.Provider value={audio}>{children}</audioContext.Provider>;
}

