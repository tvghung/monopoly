import { createContext } from 'react';
import type { SellPromptContextValue } from './types';

const sellPromptContext = createContext<SellPromptContextValue>({} as SellPromptContextValue);
export default sellPromptContext;
