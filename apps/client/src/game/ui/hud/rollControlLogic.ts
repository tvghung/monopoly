import type { PublicGameState } from '@monopoly/shared';
import type { PresentationState } from '../../presentation/store/types';

export function areAllTokensSettled(
  state: PublicGameState,
  presentationState: PresentationState,
): boolean {
  return Object.entries(state.players).every(([playerId, player]) => (
    (presentationState.settledPositions[playerId] ?? player.currentTile) === player.currentTile
  ));
}

export interface RollGateInput {
  connected: boolean;
  canMutate: boolean;
  playerId: string | null;
  pendingRequest: boolean;
}

export function shouldShowRollButton(
  currentPlayerId: string,
  playerId: string | null,
  canRoll: boolean,
  pendingRequest: boolean,
): boolean {
  return currentPlayerId === playerId && (canRoll || pendingRequest);
}

export function canRollForState(
  state: PublicGameState,
  presentationState: PresentationState,
  input: RollGateInput,
): boolean {
  const currentPlayer = state.boardState.currentPlayer;
  return input.connected
    && input.canMutate
    && !input.pendingRequest
    && typeof input.playerId === 'string'
    && currentPlayer.id === input.playerId
    && !currentPlayer.hasMoved
    && areAllTokensSettled(state, presentationState)
    && presentationState.status === 'idle'
    && !state.turnInfo.pendingLandingDecision
    && !state.boardState.paymentShortfall
    && !state.boardState.winner;
}
