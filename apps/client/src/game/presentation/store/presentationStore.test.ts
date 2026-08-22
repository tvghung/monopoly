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

  it('captures the previous settled dice pair for a subsequent roll', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    store.setDisplayDice({ dice1: 4, dice2: 5 }, 1);

    store.startDiceRoll({ dice1: 2, dice2: 6 }, 2, 640);

    expect(store.getSnapshot().diceRoll).toMatchObject({
      dice: { dice1: 2, dice2: 6 },
      fromDice: { dice1: 4, dice2: 5 },
      rollSequence: 2,
      durationMs: 640,
    });
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

  it('publishes typed one-shot consequence signals with exact deltas', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    store.emitBalanceDelta('balance-1', 'player-a', 1500, 1320, 120);
    store.emitOwnershipChange('ownership-1', 1, null, 'player-a', 180);
    store.emitDevelopmentChange('development-1', 1, 'player-a', 2, 5, 140);
    store.emitGoCrossing('go-1', 'player-a', 39, 120);

    expect(store.getSnapshot().balanceDeltas).toEqual([{
      id: 'balance-1',
      sequence: 1,
      consequenceOrder: 1,
      playerId: 'player-a',
      from: 1500,
      to: 1320,
      delta: -180,
      durationMs: 120,
    }]);
    expect(store.getSnapshot().ownershipChanges[0]).toMatchObject({
      id: 'ownership-1', tileId: 1, fromPlayerId: null, toPlayerId: 'player-a', durationMs: 180,
      consequenceOrder: 2,
    });
    expect(store.getSnapshot().developmentChanges[0]).toMatchObject({
      id: 'development-1', tileId: 1, delta: 3, direction: 'UP', durationMs: 140,
      consequenceOrder: 3,
    });
    expect(store.getSnapshot().goCrossings[0]).toMatchObject({
      id: 'go-1', playerId: 'player-a', fromTileId: 39, toTileId: 0, durationMs: 120,
      consequenceOrder: 4,
    });
  });

  it('uses one cross-family consequence order in actual emission order', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    store.emitOwnershipChange('ownership', 1, null, 'player-a', 180);
    store.emitDevelopmentChange('development', 1, 'player-a', 0, 1, 140);

    expect(store.getSnapshot().ownershipChanges[0]?.consequenceOrder).toBe(1);
    expect(store.getSnapshot().developmentChanges[0]?.consequenceOrder).toBe(2);
  });

  it('deduplicates and bounds one-shot signals, then clears them on reset', () => {
    const store = new PresentationStore();
    const room = makeRoom();
    store.resetFromSnapshot(room);

    store.emitBalanceDelta('same', 'player-a', 10, 20, 120);
    store.emitBalanceDelta('same', 'player-a', 20, 30, 120);
    for (let index = 0; index < 70; index += 1) {
      store.emitBalanceDelta(`balance-${index}`, 'player-a', index, index + 1, 120);
    }

    expect(store.getSnapshot().balanceDeltas).toHaveLength(64);
    expect(store.getSnapshot().balanceDeltas.some(signal => signal.id === 'same')).toBe(false);

    store.resetFromSnapshot({ ...room, version: 2 });
    expect(store.getSnapshot().balanceDeltas).toEqual([]);
    expect(store.getSnapshot().ownershipChanges).toEqual([]);
    expect(store.getSnapshot().developmentChanges).toEqual([]);
    expect(store.getSnapshot().goCrossings).toEqual([]);
    expect(store.getSnapshot().balanceDeltas).toEqual([]);
    store.emitBalanceDelta('same', 'player-a', 30, 40, 120);
    expect(store.getSnapshot().balanceDeltas[0]?.sequence).toBe(1);
    expect(store.getSnapshot().balanceDeltas[0]?.consequenceOrder).toBe(1);
  });
});
