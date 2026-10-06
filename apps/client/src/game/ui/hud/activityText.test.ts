import { describe, expect, it } from 'vitest';
import type { ActivityEvent, ActivityEventInput } from '@monopoly/shared';
import { activityText } from './activityText';

/** Adds the envelope every committed activity event carries. */
const event = (input: ActivityEventInput): ActivityEvent => (
  { ...input, eventId: 'event-1', sequence: 1, occurredAt: '2030-01-01T00:00:00.000Z' }
);

describe('activityText for 2v2 events', () => {
  it('names the reasons of the two new money transfers', () => {
    const revive = event({
      type: 'MONEY_TRANSFER',
      source: { kind: 'PLAYER', playerId: 'player-b', name: 'Bình' },
      destination: { kind: 'BANK' },
      amount: 750,
      reason: 'REVIVE',
    });
    expect(activityText(revive)).toBe('Bình trả 750.000 ₫ cho Ngân hàng (hồi sinh đồng đội).');
    const rescue = event({
      type: 'MONEY_TRANSFER',
      source: { kind: 'PLAYER', playerId: 'player-c', name: 'Chi' },
      destination: { kind: 'PLAYER', playerId: 'player-b', name: 'Bình' },
      amount: 120,
      reason: 'RESCUE',
    });
    expect(activityText(rescue)).toBe('Chi trả 120.000 ₫ cho Bình (hỗ trợ đồng đội).');
  });

  it('says whose property a Team Investment developed and who paid for it', () => {
    const build = event({
      type: 'PROPERTY_DEVELOPMENT',
      playerId: 'player-c',
      playerName: 'Chi',
      tileID: 1,
      fromHouses: 1,
      toHouses: 2,
      action: 'BUILD',
      cost: 50,
      ownerPlayerId: 'player-a',
      ownerName: 'An',
    });
    expect(activityText(build)).toBe('Chi đầu tư xây 1 Nhà tại Cà Mau của đồng đội An (50.000 ₫).');
    const hotel = event({ ...build, fromHouses: 4, toHouses: 5, action: 'UPGRADE_HOTEL' } as ActivityEventInput);
    expect(activityText(hotel)).toBe('Chi đầu tư nâng cấp Khách sạn tại Cà Mau của đồng đội An (50.000 ₫).');
  });

  it('keeps the ordinary development text when the owner built it themself', () => {
    const build = event({
      type: 'PROPERTY_DEVELOPMENT', playerId: 'player-a', playerName: 'An', tileID: 1, fromHouses: 0, toHouses: 1, action: 'BUILD',
    });
    expect(activityText(build)).toBe('An xây 1 Nhà tại Cà Mau.');
  });

  it('announces a team win by the team, and a Solo win by the player', () => {
    const base = {
      type: 'GAME_FINISHED' as const,
      winnerPlayerId: 'player-a',
      winnerName: 'An',
      winnerColor: 'red' as const,
      winnerCharacterId: 'dog' as const,
      finalCash: 1_200,
    };
    expect(activityText(event({ ...base, winningTeamId: 'TEAM_1', winningTeamName: 'Rồng' })))
      .toBe('Đội Rồng chiến thắng với 1.200.000 ₫ tiền mặt còn lại.');
    expect(activityText(event(base))).toBe('An chiến thắng với 1.200.000 ₫.');
  });

  it('describes the revive window, the revive and the permanent elimination', () => {
    const revive = (action: 'WINDOW_OPENED' | 'REVIVED' | 'EXPIRED', turnsRemaining: number) => event({
      type: 'TEAM_REVIVE',
      action,
      playerId: 'player-d',
      playerName: 'Dũng',
      survivorPlayerId: 'player-b',
      survivorName: 'Bình',
      turnsRemaining,
    });
    expect(activityText(revive('WINDOW_OPENED', 3))).toBe('Bình có 3 lượt để hồi sinh Dũng.');
    expect(activityText(revive('REVIVED', 2))).toBe('Bình đã hồi sinh Dũng.');
    expect(activityText(revive('EXPIRED', 0))).toBe('Dũng đã bị loại vĩnh viễn.');
  });

  it('describes each step of an Emergency Rescue', () => {
    const rescue = (action: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED') => event({
      type: 'EMERGENCY_RESCUE',
      action,
      debtorPlayerId: 'player-a',
      debtorName: 'An',
      rescuerPlayerId: 'player-c',
      rescuerName: 'Chi',
      amount: 300,
    });
    expect(activityText(rescue('OFFERED'))).toBe('Chi có thể hỗ trợ 300.000 ₫ để cứu An.');
    expect(activityText(rescue('ACCEPTED'))).toBe('Chi đã hỗ trợ 300.000 ₫ để cứu An.');
    expect(activityText(rescue('DECLINED'))).toBe('Chi không hỗ trợ An.');
    expect(activityText(rescue('EXPIRED'))).toBe('Hết thời gian: Chi chưa hỗ trợ An.');
  });
});
