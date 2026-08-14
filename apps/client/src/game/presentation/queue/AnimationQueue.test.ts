import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentationEvent } from '../events/types';
import { AnimationQueue } from './AnimationQueue';
import type { PresentationExecutor, PresentationExecutorMap } from './types';

function event(id: string): PresentationEvent {
  return {
    id,
    roomId: 'room-1',
    roomVersion: 1,
    type: 'ROLL_DICE',
    entityId: 'room',
    dice1: 1,
    dice2: 2,
  };
}

function makeExecutor(run: PresentationExecutor['run'], finish: PresentationExecutor['finish'] = () => {}): PresentationExecutorMap {
  return {
    ROLL_DICE: { run, finish },
  };
}

describe('AnimationQueue', () => {
  afterEach(() => vi.useRealTimers());

  it('processes events FIFO and resolves every item', async () => {
    const order: string[] = [];
    const queue = new AnimationQueue({
      executors: makeExecutor(async (current, context) => {
        order.push(current.id);
        await context.wait(1);
        order.push(current.id + ':done');
      }),
    });
    const promises = queue.enqueueMany([event('one'), event('two')]);
    await Promise.all(promises);
    expect(order).toEqual(['one', 'one:done', 'two', 'two:done']);
    expect(queue.getStatus()).toBe('idle');
    queue.dispose();
  });

  it('pauses between events and resumes without losing queued work', async () => {
    const order: string[] = [];
    const queue = new AnimationQueue({
      executors: makeExecutor(current => { order.push(current.id); return Promise.resolve(); }),
    });
    queue.pause();
    const pending = queue.enqueue(event('paused'));
    await Promise.resolve();
    expect(order).toEqual([]);
    queue.resume();
    await pending;
    expect(order).toEqual(['paused']);
    queue.dispose();
  });

  it('skips the current event, finishes it, and continues after an executor failure', async () => {
    const finished: string[] = [];
    const errors: unknown[] = [];
    const queue = new AnimationQueue({
      executors: makeExecutor(async (current, context) => {
        if (current.id === 'broken') throw new Error('broken executor');
        await context.wait(100);
      }, current => finished.push(current.id)),
      onError: error => errors.push(error),
    });
    const first = queue.enqueue(event('broken'));
    const second = queue.enqueue(event('slow'));
    await Promise.all([first, second]);
    expect(errors).toHaveLength(1);
    expect(finished).toEqual(['broken', 'slow']);

    const resetFinished: string[] = [];
    const resetQueue = new AnimationQueue({
      executors: makeExecutor(async (_current, context) => { await context.wait(100); }, current => resetFinished.push(current.id)),
      onReset: vi.fn(),
    });
    const running = resetQueue.enqueue(event('stale'));
    await Promise.resolve();
    resetQueue.reset();
    await running;
    expect(resetFinished).toEqual([]);
    resetQueue.dispose();
    queue.dispose();
  });

  it('honors reduced motion and resolves skipAll for current and pending work', async () => {
    const runs: string[] = [];
    const queue = new AnimationQueue({
      reducedMotion: true,
      executors: makeExecutor(async (current, context) => {
        expect(context.getDuration(100)).toBe(0);
        runs.push(current.id);
        await context.wait(100);
      }),
    });
    const current = queue.enqueue(event('current'));
    const pending = queue.enqueue(event('pending'));
    queue.skipAll();
    await Promise.all([current, pending]);
    expect(runs).toEqual(['current']);
    queue.dispose();
  });
});
