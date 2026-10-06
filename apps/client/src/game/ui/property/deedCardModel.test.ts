import { describe, expect, it } from 'vitest';
import { makeRoom, makeTeamRoom } from '../../presentation/testFixtures';
import { buildDeedCardModel, COMPLETE_GROUP_RULE_NOTE, TEAM_GROUP_RULE_NOTE } from './deedCardModel';

type Owned = Record<number, { id: string; color: 'red'; houses: number }>;

function build(tileId: number, ownedProps: Owned = {}) {
  const room = makeRoom();
  room.gameState.boardState.ownedProps = ownedProps;
  return buildDeedCardModel({ tileId, state: room.gameState, roomPlayers: room.players, theme: 'v2' });
}

describe('buildDeedCardModel', () => {
  it('carries the landmark of a street (name and picture) and none for stations, utilities or special tiles', () => {
    const landmark = build(13)!.landmark;
    expect(landmark?.name).toBe('Chùa Cầu');
    expect(landmark?.artUrl).toMatch(/\/art\/landmarks\/13\.svg$/u);
    expect(build(39)!.landmark?.name).toBe('Landmark 81');
    for (const tileId of [0, 2, 4, 5, 12, 10]) expect(build(tileId)!.landmark, `tile ${tileId}`).toBeNull();
  });

  it('returns null for a tile that does not exist', () => {
    const room = makeRoom();
    expect(buildDeedCardModel({ tileId: 99, state: room.gameState })).toBeNull();
  });

  it('describes an unowned street with its district, price, ladder and the complete-group rule', () => {
    const model = build(1)!;
    expect(model).toMatchObject({
      kind: 'street',
      name: 'Cà Mau',
      groupLabel: 'Nhóm Nâu',
      priceText: '60.000 ₫',
      houseCostText: '50.000 ₫',
      houses: 0,
      developmentText: 'Chưa có chủ sở hữu',
      owner: null,
      groupRuleNote: COMPLETE_GROUP_RULE_NOTE,
    });
    expect(model.rows.map(row => row.label)).toEqual([
      'Tiền thuê cơ bản', 'Có 1 Nhà', 'Có 2 Nhà', 'Có 3 Nhà', 'Có 4 Nhà', 'Có Khách Sạn',
    ]);
    expect(model.rows.some(row => row.label.startsWith('Giá mỗi'))).toBe(false);
    expect(model.headerColor).toBe('#8D5B3E');
    expect(model.headerTextColor).toBe('#ffffff');
    expect(model.group).toMatchObject({ total: 2, ownedByOwner: 0, text: 'Nhóm có 2 ô' });
  });

  it.each([
    [0, 'Tiền thuê cơ bản'],
    [1, 'Có 1 Nhà'],
    [2, 'Có 2 Nhà'],
    [3, 'Có 3 Nhà'],
    [4, 'Có 4 Nhà'],
    [5, 'Có Khách Sạn'],
  ])('highlights the row for %i houses on a street', (houses, label) => {
    const model = build(1, { 1: { id: 'player-a', color: 'red', houses } })!;
    const current = model.rows.filter(row => row.current);
    expect(current).toHaveLength(1);
    expect(model.rows.indexOf(current[0])).toBe(houses);
    expect(current[0].label).toBe(label);
  });

  it('marks the next development row, but not past the hotel or on an unowned street', () => {
    const two = build(1, { 1: { id: 'player-a', color: 'red', houses: 2 } })!;
    expect(two.rows.find(row => row.next)?.label).toBe('Có 3 Nhà');
    const hotel = build(1, { 1: { id: 'player-a', color: 'red', houses: 5 } })!;
    expect(hotel.rows.some(row => row.next)).toBe(false);
    expect(hotel.developmentText).toBe('1 Khách sạn');
    expect(build(3)!.rows.some(row => row.next)).toBe(false);
  });

  it('names the owner and counts the group for the owner', () => {
    const model = build(1, {
      1: { id: 'player-a', color: 'red', houses: 1 },
      3: { id: 'player-a', color: 'red', houses: 0 },
    })!;
    expect(model.owner).toMatchObject({ playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog' });
    expect(model.group).toMatchObject({ total: 2, ownedByOwner: 2, text: 'An sở hữu 2/2' });
    expect(model.group?.pips.map(pip => pip.ownerColor)).toEqual(['red', 'red']);
    expect(model.group?.pips.filter(pip => pip.self).map(pip => pip.tileId)).toEqual([1]);
  });

  it('shows group tiles held by somebody else in their own color', () => {
    const model = build(1, {
      1: { id: 'player-a', color: 'red', houses: 0 },
      3: { id: 'player-b', color: 'red', houses: 0 },
    })!;
    expect(model.group?.ownedByOwner).toBe(1);
    expect(model.group?.pips.map(pip => pip.ownerColor)).toEqual(['red', 'blue']);
    expect(model.group?.text).toBe('An sở hữu 1/2');
  });

  it('keeps naming an owner who has already left the table', () => {
    const room = makeRoom();
    room.gameState.boardState.ownedProps = { 1: { id: 'player-b', color: 'red', houses: 0 } };
    delete room.gameState.players['player-b'];
    room.gameState.boardState.finishedPlayers['player-b'] = {
      teamId: 'TEAM_2',
      name: 'Bình', color: 'blue', characterId: 'panda', reason: 'LEFT', accountBalance: 10,
    };
    const model = buildDeedCardModel({ tileId: 1, state: room.gameState })!;
    expect(model.owner?.name).toBe('Bình');
  });

  it('Solo: a completed set carries the ×1,5 bonus and the rent it makes now (floor-rounded); a split set carries none', () => {
    const complete = build(1, {
      1: { id: 'player-a', color: 'red', houses: 2 },
      3: { id: 'player-a', color: 'red', houses: 0 },
    })!;
    expect(complete.rentBonus).toEqual({ percent: 150, text: 'Đủ khu: tiền thuê ×1,5', effectiveRentText: '45.000 ₫' });
    expect(complete.groupRuleNote).toBe(COMPLETE_GROUP_RULE_NOTE);
    expect(complete.owner).toMatchObject({ team: null, relation: null });
    const split = build(1, {
      1: { id: 'player-a', color: 'red', houses: 2 },
      3: { id: 'player-b', color: 'red', houses: 0 },
    })!;
    expect(split.rentBonus).toBeNull();
    expect(build(5, { 5: { id: 'player-a', color: 'red', houses: 0 } })!.rentBonus).toBeNull();
  });

  describe('2v2', () => {
    function team(ownedProps: Owned, viewerPlayerId: string | null = 'player-a', tileId = 1) {
      const room = makeTeamRoom();
      room.gameState.boardState.ownedProps = ownedProps;
      return buildDeedCardModel({
        tileId, state: room.gameState, roomPlayers: room.players, theme: 'v2', viewerPlayerId,
      })!;
    }

    it('aggregates the set across both teammates and doubles the rent', () => {
      const model = team({
        1: { id: 'player-a', color: 'red', houses: 2 },
        3: { id: 'player-c', color: 'red', houses: 0 },
      });
      expect(model.rentBonus).toEqual({ percent: 200, text: 'Cả đội đủ khu: tiền thuê ×2', effectiveRentText: '60.000 ₫' });
      expect(model.group).toMatchObject({ total: 2, ownedByOwner: 2, text: 'Đội Team 1 sở hữu 2/2' });
      expect(model.group?.pips.map(pip => pip.ownerName)).toEqual(['An', 'Chi']);
      expect(model.groupRuleNote).toBe(TEAM_GROUP_RULE_NOTE);
    });

    it('does not give the bonus to a set split between the two teams', () => {
      const model = team({
        1: { id: 'player-a', color: 'red', houses: 0 },
        3: { id: 'player-b', color: 'red', houses: 0 },
      });
      expect(model.rentBonus).toBeNull();
      expect(model.group).toMatchObject({ ownedByOwner: 1, text: 'Đội Team 1 sở hữu 1/2' });
    });

    it('names the owner\'s team and marks self, teammate and opponent for the viewer', () => {
      const owned: Owned = { 1: { id: 'player-a', color: 'red', houses: 0 } };
      expect(team(owned, 'player-a').owner).toMatchObject({ relation: 'SELF', team: { teamId: 'TEAM_1', name: 'Team 1', color: 'red' } });
      expect(team(owned, 'player-c').owner?.relation).toBe('TEAMMATE');
      expect(team(owned, 'player-b').owner?.relation).toBe('OPPONENT');
      expect(team(owned, null).owner?.relation).toBeNull();
    });
  });

  it.each([
    [1, 'Sở hữu 1 Ga Tàu'],
    [2, 'Sở hữu 2 Ga Tàu'],
    [4, 'Sở hữu 4 Ga Tàu'],
  ])('a railroad with %i owned highlights "%s"', (count, label) => {
    const indices = [5, 15, 25, 35].slice(0, count);
    const owned: Owned = Object.fromEntries(indices.map(index => [index, { id: 'player-a', color: 'red' as const, houses: 0 }]));
    const model = build(5, owned)!;
    expect(model.kind).toBe('railroad');
    expect(model.rows).toHaveLength(4);
    expect(model.rows.find(row => row.current)?.label).toBe(label);
    expect(model.group?.total).toBe(4);
    expect(model.houseCostText).toBeNull();
    expect(model.groupRuleNote).toBeNull();
  });

  it('highlights the utility multiplier for one and for both utilities', () => {
    const one = build(12, { 12: { id: 'player-a', color: 'red', houses: 0 } })!;
    expect(one.kind).toBe('utility');
    expect(one.rows.find(row => row.current)).toMatchObject({ label: 'Sở hữu 1 Công Ty', value: 'Tổng xúc xắc ×4' });
    const both = build(12, {
      12: { id: 'player-a', color: 'red', houses: 0 },
      28: { id: 'player-a', color: 'red', houses: 0 },
    })!;
    expect(both.rows.find(row => row.current)).toMatchObject({ label: 'Sở hữu cả 2 Công Ty', value: 'Tổng xúc xắc ×10' });
    expect(both.groupLabel).toBe('Tiện ích');
  });

  it('gives special tiles rule text and no ladder, including the tax amount', () => {
    const start = build(0)!;
    expect(start).toMatchObject({ kind: 'special', name: 'Xuất Phát', rows: [], group: null, motif: null });
    expect(start.ruleLines[0]).toContain('200.000 ₫');
    const tax = build(4)!;
    expect(tax.name).toBe('Thuế Thu Nhập');
    expect(tax.ruleLines).toEqual(['Nộp 200.000 ₫ cho Ngân hàng khi dừng tại đây.']);
    expect(build(38)!.ruleLines[0]).toContain('Nộp');
  });
});
