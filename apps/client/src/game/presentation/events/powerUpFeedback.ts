import type { PowerUpOwnerState, PublicRoomState } from '@monopoly/shared';
import type { PowerUpFeedbackPresentationEvent } from './types';

/** Only the already-authorized owner's projection is compared; no hidden/public inference. */
export function derivePowerUpFeedback(previous: PowerUpOwnerState | undefined, next: PowerUpOwnerState | undefined, room: PublicRoomState, previousTurnNumber?: number): PowerUpFeedbackPresentationEvent[] {
  if (!previous || !next || room.status !== 'IN_PROGRESS' || room.gameState.boardState.winner) return [];
  const events: PowerUpFeedbackPresentationEvent[] = [];
  const add = (key: string, kind: PowerUpFeedbackPresentationEvent['kind'], definitionId: string, name: string, tileId?: number) => events.push({ id: room.roomId + ':powerup:' + room.version + ':' + key, entityId: key, roomId: room.roomId, roomVersion: room.version, type: 'POWER_UP_FEEDBACK', kind, definitionId, name, ...(tileId === undefined ? {} : { tileId }) });
  for (const card of previous.inventory?.cards ?? []) {
    if (next.inventory?.cards.some(item => item.instanceId === card.instanceId)) continue;
    // An instance can leave through theft or a U04 recipe, so removal alone never proves activation/block.
    add(card.instanceId, 'CONSUMED', card.definitionId, card.definition.name);
  }
  for (const card of next.inventory?.cards ?? []) {
    if (previous.inventory?.cards.some(item => item.instanceId === card.instanceId)) continue;
    add(card.instanceId + ':acquired', card.definition.rarity === 'LEGENDARY' ? 'LEGENDARY' : 'ACQUIRED', card.definitionId, card.definition.name);
  }
  for (const status of next.statuses ?? []) {
    const before = previous.statuses?.find(item => item.statusId === status.statusId);
    if (!before) add(status.statusId, status.definitionId === 'D04' ? 'SHIELD' : 'STATUS', status.definitionId, status.name ?? status.definitionId, status.targetTileID);
    else if (status.definitionId === 'D04' && (status.remainingUses ?? 0) < (before.remainingUses ?? 0)) add(status.statusId + ':charge:' + status.remainingUses, 'BLOCK', status.definitionId, status.name ?? status.definitionId, status.targetTileID);
  }
  for (const status of previous.statuses ?? []) {
    if (next.statuses?.some(item => item.statusId === status.statusId)) continue;
    const interceptedLastCharge = status.definitionId === 'D04' && status.remainingUses === 1 && previousTurnNumber === room.gameState.boardState.turnNumber;
    add(status.statusId + ':end', interceptedLastCharge ? 'BLOCK' : 'EXPIRED', status.definitionId, status.name ?? status.definitionId, status.targetTileID);
  }
  return events;
}
