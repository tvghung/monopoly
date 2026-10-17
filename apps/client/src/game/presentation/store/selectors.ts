import type { PresentationState } from './types';

export const selectDisplayPositions = (state: PresentationState) => state.displayPositions;
export const selectDisplayActivePlayerId = (state: PresentationState) => state.displayActivePlayerId;
export const selectPresentationStatus = (state: PresentationState) => state.status;
export const selectSettledPositions = (state: PresentationState) => state.settledPositions;
export const selectCardPresentation = (state: PresentationState) => state.cardPresentation;
export const selectPresentationResetEpoch = (state: PresentationState) => state.presentationResetEpoch;
