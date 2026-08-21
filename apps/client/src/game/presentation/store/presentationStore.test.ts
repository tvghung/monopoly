import { describe, expect, it } from 'vitest';
import { cloneRoom, makeRoom } from '../testFixtures';
import { presentationTiming } from '../timings';
import { PresentationStore } from './presentationStore';

const impactTiming = {
  delayMs: 0,
  depressDurationMs: presentationTiming.tileImpact.stepDepress,
  reboundDurationMs: presentationTiming.tileImpact.stepRebound,
};

describe('PresentationStore reset and impact generations', () => {
  it('keeps ordinary impacts out of the presentation reset generation', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const resetEpoch = store.getSnapshot().presentationResetEpoch;

    store.emitTileImpact('player-a', 1, 'STEP', impactTiming);
    store.emitTileImpact('player-b', 5, 'LAND', impactTiming);

    expect(store.getSnapshot().presentationResetEpoch).toBe(resetEpoch);
    expect(store.getSnapshot().tileImpacts.map(impact => impact.sequence)).toEqual([1, 2]);
  });

  it('does not replay stale impacts and starts a fresh sequence after snapshot reset', () => {
    const store = new PresentationStore();
    const room = makeRoom();
    store.resetFromSnapshot(room);
    store.emitTileImpact('player-a', 1, 'STEP', impactTiming);
    store.emitTileImpact('player-a', 2, 'STEP', impactTiming);

    const beforeResetEpoch = store.getSnapshot().presentationResetEpoch;
    const resetRoom = cloneRoom(room, 2);
    resetRoom.gameState.players['player-a'].currentTile = 9;
    store.resetFromSnapshot(resetRoom);

    expect(store.getSnapshot().presentationResetEpoch).toBe(beforeResetEpoch + 1);
    expect(store.getSnapshot().tileImpacts).toEqual([]);
    expect(store.getSnapshot().displayPositions['player-a']).toBe(9);
    store.emitTileImpact('player-a', 9, 'LAND', impactTiming);
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

  it('updates identical faces when the authoritative roll sequence advances', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    let notifications = 0;
    store.subscribe(() => { notifications += 1; });
    store.setDisplayDice({ dice1: 2, dice2: 3 }, 1);
    store.setDisplayDice({ dice1: 2, dice2: 3 }, 1);

    expect(store.getSnapshot().displayDice).toEqual({ dice1: 2, dice2: 3 });
    expect(store.getSnapshot().displayRollSequence).toBe(1);
    expect(notifications).toBe(1);
  });

  it('keeps an identified roll transient until the dice executor settles it', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    store.startDiceRoll({ dice1: 2, dice2: 3 }, 1, 640);

    expect(store.getSnapshot().diceRoll).toEqual({
      lifecycle: 'rolling',
      dice: { dice1: 2, dice2: 3 },
      rollSequence: 1,
      durationMs: 640,
    });
    expect(store.getSnapshot().displayRollSequence).toBe(0);

    store.syncDisplayDice({ dice1: 6, dice2: 6 }, 1);
    expect(store.getSnapshot().diceRoll?.dice).toEqual({ dice1: 2, dice2: 3 });

    store.settleDiceRoll({ dice1: 2, dice2: 3 }, 1);
    expect(store.getSnapshot().diceRoll).toBeNull();
    expect(store.getSnapshot().displayDice).toEqual({ dice1: 2, dice2: 3 });
    expect(store.getSnapshot().displayRollSequence).toBe(1);
  });

  it('clears a transient roll when a reset snapshot becomes authoritative', () => {
    const store = new PresentationStore();
    const room = makeRoom();
    store.resetFromSnapshot(room);
    store.startDiceRoll({ dice1: 4, dice2: 5 }, 1, 640);

    const reset = cloneRoom(room, 2);
    reset.gameState.boardState.diceValue = { dice1: 4, dice2: 5 };
    reset.gameState.boardState.rollSequence = 1;
    store.resetFromSnapshot(reset);

    expect(store.getSnapshot().diceRoll).toBeNull();
    expect(store.getSnapshot().displayDice).toEqual({ dice1: 4, dice2: 5 });
    expect(store.getSnapshot().displayRollSequence).toBe(1);
  });

  it('snaps dice faces and sequence on reset without replaying the baseline', () => {
    const store = new PresentationStore();
    const initial = makeRoom();
    store.resetFromSnapshot(initial);
    store.setDisplayDice({ dice1: 2, dice2: 3 }, 1);

    const reset = cloneRoom(initial, 2);
    reset.gameState.boardState.diceValue = { dice1: 2, dice2: 3 };
    reset.gameState.boardState.rollSequence = 2;
    store.resetFromSnapshot(reset);

    expect(store.getSnapshot().displayDice).toEqual({ dice1: 2, dice2: 3 });
    expect(store.getSnapshot().displayRollSequence).toBe(2);
  });

  it('synchronizes a face-only authoritative correction without creating a roll', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    store.syncDisplayDice({ dice1: 5, dice2: 6 }, 0);

    expect(store.getSnapshot().displayDice).toEqual({ dice1: 5, dice2: 6 });
    expect(store.getSnapshot().displayRollSequence).toBe(0);
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
