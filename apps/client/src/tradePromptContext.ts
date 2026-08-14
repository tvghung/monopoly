import { createContext } from 'react';
import type { TradePromptContextValue } from './types';

const tradePromptContext = createContext<TradePromptContextValue>({} as TradePromptContextValue);
export default tradePromptContext;
