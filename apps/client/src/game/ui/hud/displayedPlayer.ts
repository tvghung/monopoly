import type { PublicGameState } from '@monopoly/shared';

export type DisplayedPlayer = Pick<PublicGameState['players'][string], 'name' | 'color' | 'characterId'>;

/**
 * The player the presentation still shows as on the move. `displayActivePlayerId` lags the server, so a player who
 * went bankrupt or left on their turn is already gone from `players` and only listed in `finishedPlayers` while the
 * turn change is being presented.
 */
export function resolveDisplayedPlayer(state: PublicGameState, playerId: string): DisplayedPlayer | undefined {
  const player = state.players[playerId];
  if (player) return player;
  const finished = state.boardState.finishedPlayers[playerId];
  return finished ? { name: finished.name, color: finished.color, characterId: finished.characterId } : undefined;
}
