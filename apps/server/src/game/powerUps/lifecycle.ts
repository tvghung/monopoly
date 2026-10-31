import type { GameState, PlayerId, PowerUpStatus } from '@monopoly/shared';

const activeStatuses = (state: GameState): PowerUpStatus[] => (
  state.privateState.powerUps?.statuses ?? []
);

/** Owner-turn durations advance only when that owner's turn actually ends. */
export function completePowerUpOwnerTurn(state: GameState, playerId: PlayerId): void {
  const powerUps = state.privateState.powerUps;
  if (!powerUps) return;
  const survivors: PowerUpStatus[] = [];
  for (const status of activeStatuses(state)) {
    if (status.ownerTurnPlayerId === playerId && status.remainingOwnerTurns !== undefined) {
      status.remainingOwnerTurns -= 1;
      if (status.remainingOwnerTurns <= 0) continue;
    }
    survivors.push(status);
  }
  powerUps.statuses = survivors;
}

/** Start-bound effects expire immediately before their named player's next action. */
export function beginPowerUpPlayerTurn(state: GameState, playerId: PlayerId): void {
  const powerUps = state.privateState.powerUps;
  if (!powerUps) return;
  const turnNumber = state.boardState.turnNumber;
  powerUps.statuses = activeStatuses(state).filter(status => (
    status.expiresAtStartPlayerId !== playerId
    && (status.expiresAtTurnNumber === undefined || status.expiresAtTurnNumber >= turnNumber)
  ));
}

/** Remove effects whose source or target can no longer participate in the match. */
export function removePowerUpPlayerState(state: GameState, playerId: PlayerId): void {
  const powerUps = state.privateState.powerUps;
  if (!powerUps) return;
  delete powerUps.inventories[playerId];
  delete powerUps.activeUsage?.[playerId];
  const statuses: PowerUpStatus[] = [];
  for (const status of activeStatuses(state)) {
    if (status.sourcePlayerId === playerId) continue;
    if (status.targetPlayerId === playerId) continue;
    if (status.affectedPlayerIds?.includes(playerId)) {
      status.affectedPlayerIds = status.affectedPlayerIds.filter(id => id !== playerId);
      if (status.affectedPlayerIds.length === 0) continue;
    }
    if (status.ownerTurnPlayerId === playerId || status.expiresAtStartPlayerId === playerId) continue;
    statuses.push(status);
  }
  powerUps.statuses = statuses;
  if (powerUps.pendingMovement?.playerId === playerId) powerUps.pendingMovement = null;
  if (powerUps.pendingReaction && (
    ('attackerPlayerId' in powerUps.pendingReaction && powerUps.pendingReaction.attackerPlayerId === playerId)
    || ('defenderPlayerId' in powerUps.pendingReaction && powerUps.pendingReaction.defenderPlayerId === playerId)
    || ('debtorPlayerId' in powerUps.pendingReaction && powerUps.pendingReaction.debtorPlayerId === playerId)
    || ('landlordPlayerId' in powerUps.pendingReaction && powerUps.pendingReaction.landlordPlayerId === playerId)
  )) powerUps.pendingReaction = null;
  if (powerUps.pendingTrade && (
    powerUps.pendingTrade.initiatorPlayerId === playerId || powerUps.pendingTrade.targetPlayerId === playerId
  )) powerUps.pendingTrade = null;
}

export function clearFinishedPowerUpRuntime(state: GameState): void {
  const powerUps = state.privateState.powerUps;
  if (!powerUps) return;
  powerUps.statuses = [];
  powerUps.pendingReaction = null;
  powerUps.pendingMovement = null;
  powerUps.pendingTrade = null;
  powerUps.activeUsage = {};
}
