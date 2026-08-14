import { createContext, useMemo, type ReactNode } from 'react';
import { useSettings } from '../settings/selectors';
import type { AudioMix } from './types';

export const audioContext = createContext<AudioMix>({
  masterGain: 1,
  musicGain: 0.7,
  sfxGain: 0.8,
});

export function AudioProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const mix = useMemo(() => ({
    masterGain: settings.masterVolume,
    musicGain: settings.musicVolume,
    sfxGain: settings.sfxVolume,
  }), [settings.masterVolume, settings.musicVolume, settings.sfxVolume]);
  return <audioContext.Provider value={mix}>{children}</audioContext.Provider>;
}

