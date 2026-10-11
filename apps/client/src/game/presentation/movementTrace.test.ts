import { afterEach, describe, expect, it } from 'vitest';
import { recordCharacterMovementTrace } from './movementTrace';

const originalSearch = window.location.search;

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname + originalSearch);
  delete window.__OWN_THE_BLOCK_MOVEMENT_TRACE__;
});

describe('dev movement trace', () => {
  it('records signal and rendered-frame samples only when explicitly enabled', () => {
    window.history.replaceState(null, '', window.location.pathname + '?motion-trace=1');
    recordCharacterMovementTrace({
      stage: 'FRAME',
      playerId: 'player-a',
      sequence: 1,
      rollSequence: 4,
      resetEpoch: 2,
      displayTileId: 7,
      settledTileId: 6,
      targetAnchor: [1, 0, 0],
      schedulerTimestampMs: 1_000,
      position: [1, 0.6, 0],
    });

    expect(window.__OWN_THE_BLOCK_MOVEMENT_TRACE__).toMatchObject([
      {
        stage: 'FRAME', playerId: 'player-a', sequence: 1, rollSequence: 4, resetEpoch: 2,
        displayTileId: 7, settledTileId: 6, targetAnchor: [1, 0, 0], schedulerTimestampMs: 1_000,
        position: [1, 0.6, 0],
      },
    ]);
    expect(window.__OWN_THE_BLOCK_MOVEMENT_TRACE__?.[0]?.atMs).toEqual(expect.any(Number));
  });

  it('does not retain more than the latest 512 samples', () => {
    window.history.replaceState(null, '', window.location.pathname + '?motion-trace=1');
    for (let index = 0; index < 513; index += 1) {
      recordCharacterMovementTrace({ stage: 'FRAME', playerId: 'player-a', sequence: index });
    }

    expect(window.__OWN_THE_BLOCK_MOVEMENT_TRACE__).toHaveLength(512);
    expect(window.__OWN_THE_BLOCK_MOVEMENT_TRACE__?.[0]?.sequence).toBe(1);
  });

  it('is inert unless the trace query flag is present', () => {
    window.history.replaceState(null, '', window.location.pathname);
    recordCharacterMovementTrace({ stage: 'STORE_START', playerId: 'player-a' });
    expect(window.__OWN_THE_BLOCK_MOVEMENT_TRACE__).toBeUndefined();
  });
});
