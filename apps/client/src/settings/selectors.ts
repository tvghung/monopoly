import { useContext, useEffect, useState } from 'react';
import settingsContext from './SettingsContext';

export function useSettings() {
  return useContext(settingsContext);
}

/** Whether a `SettingsProvider` is above, that is, whether a change made in the settings dialog is kept. */
export function useSettingsAvailable(): boolean {
  return useContext(settingsContext).available === true;
}

function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useSystemReducedMotion(): boolean {
  // Read at the first render: a dialog that mounts under an OS-level reduced-motion preference must not start from its
  // normal entrance and then stay half-scaled when the preference is noticed one effect later.
  const [reduced, setReduced] = useState(systemPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    if (!media.addEventListener) media.addListener(update);
    return () => {
      media.removeEventListener?.('change', update);
      if (!media.removeEventListener) media.removeListener(update);
    };
  }, []);

  return reduced;
}

export function useEffectiveReducedMotion(): boolean {
  const { settings } = useSettings();
  const systemReducedMotion = useSystemReducedMotion();
  return settings.reducedMotion || systemReducedMotion;
}
