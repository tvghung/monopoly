import { afterEach, describe, expect, it, vi } from 'vitest';
import { markSceneOnce, resetSceneMarks } from './sceneMarks';

// jsdom has no performance.mark; give it one for the test and remove it again.
function installMark(implementation: (name: string) => void) {
  const mark = vi.fn(implementation);
  Object.defineProperty(performance, 'mark', { value: mark, configurable: true, writable: true });
  return mark;
}

afterEach(() => {
  Reflect.deleteProperty(performance, 'mark');
  resetSceneMarks();
});

describe('markSceneOnce', () => {
  it('records each mark the first time only, under the otb:scene: prefix', () => {
    const mark = installMark(() => {});
    markSceneOnce('canvas-created');
    markSceneOnce('canvas-created');
    markSceneOnce('env-start');
    expect(mark.mock.calls.map(call => call[0])).toEqual(['otb:scene:canvas-created', 'otb:scene:env-start']);
  });

  it('never throws, even where the Performance API refuses or does not exist', () => {
    installMark(() => { throw new Error('unavailable'); });
    expect(() => markSceneOnce('x')).not.toThrow();
    Reflect.deleteProperty(performance, 'mark');
    expect(() => markSceneOnce('y')).not.toThrow();
  });
});
