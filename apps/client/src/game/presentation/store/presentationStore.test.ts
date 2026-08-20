import { describe, expect, it } from 'vitest';
import { cloneRoom, makeRoom } from '../testFixtures';
import { PresentationStore } from './presentationStore';

describe('PresentationStore reset and impact generations', () => {
  it('keeps ordinary impacts out of the presentation reset generation', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const resetEpoch = store.getSnapshot().presentationResetEpoch;

    store.emitTileImpact('player-a', 1, 'STEP');
    store.emitTileImpact('player-b', 5, 'LAND');

    expect(store.getSnapshot().presentationResetEpoch).toBe(resetEpoch);
    expect(store.getSnapshot().tileImpacts.map(impact => impact.sequence)).toEqual([1, 2]);
  });

  it('does not replay stale impacts and starts a fresh sequence after snapshot reset', () => {
    const store = new PresentationStore();
    const room = makeRoom();
    store.resetFromSnapshot(room);
    store.emitTileImpact('player-a', 1, 'STEP');
    store.emitTileImpact('player-a', 2, 'STEP');

    const beforeResetEpoch = store.getSnapshot().presentationResetEpoch;
    const resetRoom = cloneRoom(room, 2);
    resetRoom.gameState.players['player-a'].currentTile = 9;
    store.resetFromSnapshot(resetRoom);

    expect(store.getSnapshot().presentationResetEpoch).toBe(beforeResetEpoch + 1);
    expect(store.getSnapshot().tileImpacts).toEqual([]);
    expect(store.getSnapshot().displayPositions['player-a']).toBe(9);
    store.emitTileImpact('player-a', 9, 'LAND');
    expect(store.getSnapshot().tileImpacts[0]?.sequence).toBe(1);
  });

  it('keeps logical hop origins and resolved durations independent of rendered frames', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    store.startCharacterHop('player-a', 0, 1, 90);
    store.completeCharacterHop('player-a', 1);
    store.startCharacterHop('player-a', 1, 2, 240);

    expect(store.getSnapshot().characterMovements.map(signal => ({
      phase: signal.phase,
      from: signal.fromTileId,
      to: signal.toTileId,
      duration: signal.durationMs,
    }))).toEqual([
      { phase: 'START', from: 0, to: 1, duration: 90 },
      { phase: 'COMPLETE', from: 0, to: 1, duration: 90 },
      { phase: 'START', from: 1, to: 2, duration: 240 },
    ]);
    expect(store.getSnapshot().settledPositions['player-a']).toBe(1);
    expect(store.getSnapshot().displayPositions['player-a']).toBe(2);
  });

  it('records count-aware destination slots without making the stationary occupant hop', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    store.startCharacterHop('player-b', 5, 0, 180);

    expect(store.getSnapshot().characterMovements[0]).toMatchObject({
      playerId: 'player-b',
      fromTileId: 5,
      toTileId: 0,
      fromSlotIndex: 0,
      fromOccupantCount: 1,
      toSlotIndex: 1,
      toOccupantCount: 2,
    });
    expect(store.getSnapshot().characterMovements).toHaveLength(1);
  });
});
