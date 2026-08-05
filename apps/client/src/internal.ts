import { createContext } from 'react';
import type { StateContextValue } from './types';

const stateContext = createContext<StateContextValue>({} as StateContextValue);
export default stateContext;
