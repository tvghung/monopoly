import * as THREE from 'three';
import { sampleCharacterHop } from '../scene/characters/characterMotion';
import { afterAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMovementExecutor } from './executors/movementExecutor';
import { PresentationStore } from './store/presentationStore';
import { PresentationController } from './PresentationController';
import { makeRoom } from './testFixtures';
// Test-generated measurements must never overwrite preserved B8 evidence.
const evidenceDirectory = mkdtempSync(join(tmpdir(), 'otb-b8-cadence-'));
afterAll(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
it('records the B8 timing with 12ms late timers', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const store = new PresentationStore();
  store.resetFromSnapshot(makeRoom());
  const starts: number[] = [];
  const start = store.startCharacterHop.bind(store);
  vi.spyOn(store, 'startCharacterHop').mockImplementation((...args) => { starts.push(now); start(...args); });
  await createMovementExecutor(store).run({ id: 'baseline', roomId: 'room-1', roomVersion: 2, type: 'MOVE_CHARACTER', entityId: 'player-a', playerId: 'player-a', from: 0, to: 5, steps: 5, presentation: 'WALK' }, {
    signal: new AbortController().signal, speedMultiplier: 1, reducedMotion: false, getDuration: ms => ms,
    wait: ms => { now += ms; return Promise.resolve(); }, waitForDuration: ms => { now += ms + 12; return Promise.resolve(); },
  });
  const controller = new PresentationController();
  controller.acceptRoomSnapshot(makeRoom(), 'SESSION_SYNC');
  const next = makeRoom(2);
  next.gameState.players['player-a'].currentTile = 5;
  controller.acceptRoomSnapshot(next, 'LIVE_UPDATE');
  const report = { kind: 'deterministic simulation, not device measurement', timerLatenessMs: 12, starts, durationMs: now - starts[0], idealDurationMs: 900, finalTile: store.getSnapshot().settledPositions['player-a'], visibilityRecoveryAPI: typeof (controller as unknown as {
      setVisibility?: unknown;
    }).setVisibility, queuedStatus: controller.queue.getStatus() };
  writeFileSync(join(evidenceDirectory, 'after-simulation.json'), JSON.stringify(report, null, 2) + '\n');
  expect(report.durationMs).toBe(912);
  expect(report.finalTile).toBe(5);
  controller.dispose();
  vi.restoreAllMocks();
});
for (const fps of [30, 60, 120, 180, 240])
  for (const speed of [0.75, 1, 1.5, 2]) {
    it('keeps nominal boundaries and correct samples at ' + fps + ' FPS / ' + speed + 'x with irregular delivery', async () => {
      let now = 0;
      const hop = 180 / speed;
      const store = new PresentationStore();
      store.resetFromSnapshot(makeRoom());
      const start = now;
      let waits = 0;
      await createMovementExecutor(store).run({ id: 'cadence', roomId: 'room-1', roomVersion: 2, type: 'MOVE_CHARACTER', entityId: 'player-a', playerId: 'player-a', from: 8, to: 14, steps: 6, presentation: 'WALK' }, {
        signal: new AbortController().signal, speedMultiplier: speed, reducedMotion: false, now: () => now, getDuration: ms => ms / speed,
        wait: ms => { now += ms / speed; return Promise.resolve(); }, waitForDuration: ms => { now += ms + [4, 12, 28, 1][waits++ % 4]; return Promise.resolve(); },
      });
      const signals = store.getSnapshot().characterMovements.filter(s => s.phase === 'START');
      expect(signals).toHaveLength(6);
      signals.slice(1).forEach((s, i) => expect(s.startedAtMs! - (signals[i].startedAtMs! + hop)).toBeCloseTo(0, 6));
      expect(now - start - 220 / speed).toBeLessThanOrEqual(6 * hop + 28);
      expect(store.getSnapshot().settledPositions['player-a']).toBe(14);
      // Actual rendering below the cap and irregular frames still sample the same elapsed-time arc.
      const from = new THREE.Vector3(1, 0, 0);
      const to = new THREE.Vector3(2, 0, 0);
      let elapsed = 0;
      while (elapsed < hop) {
        const sample = sampleCharacterHop(elapsed, from, to, hop);
        expect(sample.position[0]).toBeCloseTo(1 + elapsed / hop, 6);
        elapsed += 1000 / Math.min(fps, 45) + (Math.floor(elapsed) % 3) * 2;
      }
      expect(sampleCharacterHop(elapsed, from, to, hop).position).toEqual([2, 0, 0]);
    });
  }
