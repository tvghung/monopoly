import { useContext, useEffect, useState } from 'react';
import settingsContext from './SettingsContext';

export function useSettings() {
  return useContext(settingsContext);
}

function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

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
