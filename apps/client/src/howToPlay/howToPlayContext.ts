import { createContext, useContext } from 'react';

export interface HowToPlayControls {
  /**
   * True inside a `HowToPlayProvider`. Outside one (an isolated render in a test or the Design Lab) nothing can open the
   * guide, so `HowToPlayButton` leaves itself out instead of showing a button that does nothing.
   */
  available: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const doNothing = (): void => undefined;

const UNAVAILABLE: HowToPlayControls = Object.freeze({
  available: false,
  isOpen: false,
  open: doNothing,
  close: doNothing,
});

export const howToPlayContext = createContext<HowToPlayControls>(UNAVAILABLE);

/** Opens and closes the one how-to-play dialog that `HowToPlayProvider` owns. */
export function useHowToPlay(): HowToPlayControls {
  return useContext(howToPlayContext);
}
