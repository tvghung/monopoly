import { describe, expect, it } from 'vitest';
import type { LobbyPlayerView } from './lobbyTypes';
import { getStartBlockReason } from './startReadiness';

const ada: LobbyPlayerView = {
  teamId: 'TEAM_2',
  teamSlot: 0,
  id: 'player-a', name: 'Ada', color: 'red', characterId: 'dog', ready: true, connected: true,
};
const grace: LobbyPlayerView = {
  teamId: 'TEAM_2',
  teamSlot: 1,
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

describe('getStartBlockReason in 2v2', () => {
  const seat = (
    id: string,
    teamId: 'TEAM_1' | 'TEAM_2',
    characterId: LobbyPlayerView['characterId'],
    teamSlot: LobbyPlayerView['teamSlot'] = 0,
  ): LobbyPlayerView => ({
    id, name: id, teamId, teamSlot, color: teamId === 'TEAM_1' ? 'red' : 'blue', characterId, ready: true, connected: true,
  });
  const balanced = [
    seat('a', 'TEAM_1', 'dog'),
    seat('b', 'TEAM_2', 'panda'),
    seat('c', 'TEAM_1', 'cat', 1),
    seat('d', 'TEAM_2', 'duck', 1),
  ];

  it('starts with exactly four ready, connected players, two on each team', () => {
    expect(getStartBlockReason(balanced, 2, 4, 'TEAM_2V2')).toBeNull();
  });

  it('needs exactly four players, never the Solo 2 to 4 range', () => {
    expect(getStartBlockReason(balanced.slice(0, 2), 2, 4, 'TEAM_2V2')).toBe('Chế độ 2v2 cần đúng 4 người chơi');
    expect(getStartBlockReason(balanced.slice(0, 3), 2, 4, 'TEAM_2V2')).toBe('Chế độ 2v2 cần đúng 4 người chơi');
    expect(getStartBlockReason(balanced.slice(0, 3), 2, 4)).toBeNull();
  });

  it('refuses a 3v1 split while it can still be configured', () => {
    const threeToOne = [balanced[0], balanced[1], { ...balanced[2], teamId: 'TEAM_2' as const }, { ...balanced[3], teamId: 'TEAM_2' as const }];
    expect(getStartBlockReason(threeToOne, 2, 4, 'TEAM_2V2')).toBe('Mỗi đội cần đúng 2 người chơi');
  });

  it('waits for ready, mascots and connections before looking at duplicates', () => {
    expect(getStartBlockReason([{ ...balanced[0], ready: false }, ...balanced.slice(1)], 2, 4, 'TEAM_2V2')).toBe('Chờ mọi người sẵn sàng');
    expect(getStartBlockReason([{ ...balanced[0], characterId: null }, ...balanced.slice(1)], 2, 4, 'TEAM_2V2')).toBe('Có người chưa chọn mascot');
    expect(getStartBlockReason([{ ...balanced[0], connected: false }, ...balanced.slice(1)], 2, 4, 'TEAM_2V2')).toBe('Có người đang mất kết nối');
  });

  it('flags two teammates with one mascot, but lets the other team use it', () => {
    expect(getStartBlockReason([balanced[0], balanced[1], { ...balanced[2], characterId: 'dog' }, balanced[3]], 2, 4, 'TEAM_2V2'))
      .toBe('Hai đồng đội đang trùng mascot');
    expect(getStartBlockReason([balanced[0], balanced[1], balanced[2], { ...balanced[3], characterId: 'dog' }], 2, 4, 'TEAM_2V2'))
      .toBeNull();
  });
});
