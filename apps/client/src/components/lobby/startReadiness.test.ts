import { describe, expect, it } from 'vitest';
import type { LobbyPlayerView } from './lobbyTypes';
import { getStartBlockReason } from './startReadiness';

const ada: LobbyPlayerView = {
  id: 'player-a', name: 'Ada', color: 'red', characterId: 'dog', ready: true, connected: true,
};
const grace: LobbyPlayerView = {
  id: 'player-b', name: 'Grace', color: 'blue', characterId: 'panda', ready: true, connected: true,
};

describe('getStartBlockReason', () => {
  it('has no reason once 2-4 connected, ready players wear different appearances', () => {
    expect(getStartBlockReason([ada, grace], 2, 4)).toBeNull();
    expect(getStartBlockReason([
      ada,
      grace,
      { ...ada, id: 'player-c', color: 'green', characterId: 'cat' },
      { ...ada, id: 'player-d', color: 'yellow', characterId: 'duck' },
    ], 2, 4)).toBeNull();
  });

  it('asks for more players below the minimum, even when the one player is not ready', () => {
    expect(getStartBlockReason([{ ...ada, ready: false }], 2, 4)).toBe('Cần ít nhất 2 người chơi');
    expect(getStartBlockReason([], 2, 4)).toBe('Cần ít nhất 2 người chơi');
  });

  it('names the maximum when the room holds too many players', () => {
    const crowd = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({
      ...ada, id, color: (['red', 'blue', 'green', 'yellow', 'orange'] as const)[index],
    }));
    expect(getStartBlockReason(crowd, 2, 4)).toBe('Tối đa 4 người chơi');
  });

  it('waits for everyone to be ready', () => {
    expect(getStartBlockReason([ada, { ...grace, ready: false }], 2, 4)).toBe('Chờ mọi người sẵn sàng');
  });

  it('flags a player who has no mascot yet', () => {
    expect(getStartBlockReason([ada, { ...grace, characterId: null }], 2, 4)).toBe('Có người chưa chọn mascot');
  });

  it('flags a player who is offline', () => {
    expect(getStartBlockReason([ada, { ...grace, connected: false }], 2, 4)).toBe('Có người đang mất kết nối');
  });

  it('flags two players with the same mascot and color, but not the same mascot in another color', () => {
    expect(getStartBlockReason([ada, { ...grace, color: 'red', characterId: 'dog' }], 2, 4))
      .toBe('Hai người đang trùng mascot và màu');
    expect(getStartBlockReason([ada, { ...grace, color: 'blue', characterId: 'dog' }], 2, 4)).toBeNull();
    expect(getStartBlockReason([ada, { ...grace, color: 'red', characterId: 'panda' }], 2, 4)).toBeNull();
  });

  it('reports the first applicable reason in the order a host can act on them', () => {
    const waiting = { ...grace, ready: false, characterId: null, connected: false };
    expect(getStartBlockReason([ada, waiting], 2, 4)).toBe('Chờ mọi người sẵn sàng');
    expect(getStartBlockReason([ada, { ...waiting, ready: true }], 2, 4)).toBe('Có người chưa chọn mascot');
    expect(getStartBlockReason([ada, { ...waiting, ready: true, characterId: 'panda' }], 2, 4))
      .toBe('Có người đang mất kết nối');
  });

  it('uses the minimum the server announced', () => {
    expect(getStartBlockReason([ada, grace], 3, 4)).toBe('Cần ít nhất 3 người chơi');
  });
});
