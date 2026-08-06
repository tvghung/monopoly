import { useReducedMotion } from 'framer-motion';

// Shared framer-motion presets for the dashboard's modal dialogs: a fading
// backdrop and a scale/slide-in card. When the user prefers reduced motion both
// collapse to empty prop bags so the modals appear instantly.
export function useModalMotion() {
  const reduced = useReducedMotion() ?? false;
  const backdropMotion = reduced
    ? {}
    : {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.15 },
    };
  const modalMotion = reduced
    ? {}
    : {
      initial: { opacity: 0, scale: 0.9, y: 12 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.9, y: 12 },
      transition: { duration: 0.2, ease: 'easeOut' as const },
    };
  return { backdropMotion, modalMotion };
}
