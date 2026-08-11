import { describe, expect, it } from 'vitest';
import { ConnectionRegistry } from './connectionRegistry';

describe('ConnectionRegistry', () => {
  it('lets the newest transport own a stable player identity', () => {
    const registry = new ConnectionRegistry();
    const first = registry.activate('player-1', 'socket-old');
    const second = registry.activate('player-1', 'socket-new');

    expect(first.generation).toBe(1);
    expect(second).toEqual({
      socketId: 'socket-new',
      generation: 2,
      replacedSocketId: 'socket-old',
    });
    expect(registry.isCurrent('player-1', 'socket-new', 2)).toBe(true);
  });

  it('ignores a stale disconnect after a duplicate-session takeover', () => {
    const registry = new ConnectionRegistry();
    const first = registry.activate('player-1', 'socket-old');
    const second = registry.activate('player-1', 'socket-new');

    expect(registry.deactivate('player-1', 'socket-old', first.generation)).toBe(false);
    expect(registry.isConnected('player-1')).toBe(true);
    expect(registry.deactivate('player-1', 'socket-new', second.generation)).toBe(true);
    expect(registry.isConnected('player-1')).toBe(false);
  });
});
