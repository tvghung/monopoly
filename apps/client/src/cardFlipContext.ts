import { createContext, type Dispatch } from 'react';
import type { BackCard } from './components/backOfCards';

export interface CardFlipAction {
  type: 'FLIP_CARD';
  payload: BackCard[];
}

export interface CardFlipContextValue {
  cardsBack: BackCard[];
  dispatch: Dispatch<CardFlipAction>;
}

const cardFlipContext = createContext<CardFlipContextValue>({} as CardFlipContextValue);
export default cardFlipContext;
