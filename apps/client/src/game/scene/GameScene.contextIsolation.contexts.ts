import { createContext } from 'react';

/** A stand-in for any other app context (settings, language, trade prompt): the canvas must keep bridging these. */
export const OtherProbeContext = createContext<string>('unset');
