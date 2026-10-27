import type { GameState } from '@monopoly/shared';
import { completeTurnResolution } from '../game/turn';
import { hasMandatoryPowerUpReward, powerUpInteractionsClear } from '../game/powerUps/foundation';
import { autoResolvePowerUpRewards, cleanupFinishedPowerUps, cleanupPowerUpOwner } from '../game/powerUps/rewards';
import type { RoomSnapshot } from '../rooms';
import type { AppRuntime } from './runtime';
import { isSeatPresent } from './presence';

export const powerUpCheckpointClear = powerUpInteractionsClear;

/** Runs on every successful room draft. No external delivery, timers or random client privileges. */
export function settlePowerUpCheckpoint(state: GameState, snapshot: RoomSnapshot, runtime: AppRuntime, now: Date): void {
  const powerUps = state.privateState.powerUps;
  if (!powerUps) return;
  if (state.boardState.winner) { cleanupFinishedPowerUps(state); return; }
  const deadlines = powerUps.offlineDeadlines ??= {};
  const owners = new Set(powerUps.rewardQueue.offers.map(offer => offer.ownerPlayerId));
  for (const owner of owners) {
    if (!state.players[owner]) { cleanupPowerUpOwner(state, owner); continue; }
    const pending = hasMandatoryPowerUpReward(state, owner);
    const bot = snapshot.members[owner]?.kind === 'BOT';
    const present = isSeatPresent(runtime.connections, snapshot, owner);
    if (!pending || present) delete deadlines[owner];
    if (pending && !present) {
      deadlines[owner] ??= state.boardState.turnRecovery?.playerId === owner
        ? state.boardState.turnRecovery.deadlineAt : new Date(now.getTime() + runtime.timing.reconnectGraceMs).toISOString();
    }
    if (pending && powerUpCheckpointClear(state) && (bot || (!present && Date.parse(deadlines[owner]) <= now.getTime()))) {
      autoResolvePowerUpRewards(state, owner);
      delete deadlines[owner];
    }
  }
  const continuation = powerUps.continuation;
  if (continuation && !hasMandatoryPowerUpReward(state, continuation.playerId) && powerUpCheckpointClear(state)) {
    powerUps.continuation = null;
    completeTurnResolution(state, continuation);
  }
}
