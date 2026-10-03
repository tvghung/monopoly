import { useCallback, useMemo, useState, type ReactNode } from 'react';
import HowToPlayModal from './HowToPlayModal';
import { howToPlayContext } from './howToPlayContext';

/**
 * Owns the one how-to-play dialog for the whole app and lets any screen open it through `useHowToPlay()`. It depends on no
 * other provider (the launcher and the loading screens render before settings, audio and toasts exist), so it wraps the app
 * at the root. The dialog's content is only built while it is open.
 */
export function HowToPlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const controls = useMemo(() => ({
    available: true, isOpen, open, close,
  }), [close, isOpen, open]);

  return (
    <howToPlayContext.Provider value={controls}>
      {children}
      <HowToPlayModal open={isOpen} onClose={close} />
    </howToPlayContext.Provider>
  );
}
