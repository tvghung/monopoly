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
});
