import { describe, expect, it } from 'vitest';
import { REVIVE_WINDOW_SURVIVOR_TURNS, type ActivityEvent, type ActivityEventInput } from '@monopoly/shared';
import { activitySegments, activityText } from './activityText';

/** Adds the envelope every committed activity event carries. */
const event = (input: ActivityEventInput): ActivityEvent => (
  { ...input, eventId: 'event-1', sequence: 1, occurredAt: '2030-01-01T00:00:00.000Z' }
);

describe('activityText for 2v2 events', () => {
  it('translates semantic activity while preserving player names and chat text', () => {
    const landed = event({ type: 'TILE_LANDED', playerId: 'player-a', playerName: 'An', tileID: 4 });
    expect(activityText(landed, 'en')).toBe('An landed on Income Tax.');
    const chat = event({ type: 'CHAT', senderRole: 'PLAYER', senderPlayerId: 'player-a', senderName: 'An', message: 'Chúc may mắn!' });
    expect(activityText(chat, 'en')).toBe('An: Chúc may mắn!');
  });

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
    expect(activityText(revive('WINDOW_OPENED', REVIVE_WINDOW_SURVIVOR_TURNS)))
      .toBe(`Bình có ${REVIVE_WINDOW_SURVIVOR_TURNS} lượt để hồi sinh Dũng.`);
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

it('OB-12 translates receipt/use and keeps official proper card names',()=>{
 const receipt=event({type:'POWER_UP_RECEIVED',playerId:'a',playerName:'Hưng'});
 const used=event({type:'POWER_UP_USED',playerId:'a',playerName:'Hưng',definitionId:'U02',cardName:'Tăng Tốc'});
 expect(activityText(receipt,'vi')).toBe('Hưng đã nhận 1 thẻ Power-up');
 expect(activityText(receipt,'en')).toBe('Hưng received a Power-up card');
 expect(activityText(used,'vi')).toBe('Hưng đã dùng thẻ Tăng Tốc');
 expect(activityText(used,'en')).toBe('Hưng used Tăng Tốc');
});


describe('OB-14 player segments', () => {
  it('tags semantic slots by ID even when names match content or contain placeholders', () => {
    const name = 'Tăng Tốc {playerName} <img>';
    const receipt = event({ type: 'POWER_UP_RECEIVED', playerId: 'a', playerName: name });
    const used = event({ type: 'POWER_UP_USED', playerId: 'a', playerName: name, definitionId: 'U02', cardName: name });
    for (const language of ['vi', 'en'] as const) {
      expect(activitySegments(receipt, language).filter(s => s.playerId)).toEqual([{ text: name, playerId: 'a' }]);
      const parts = activitySegments(used, language);
      expect(parts.filter(s => s.playerId)).toEqual([{ text: name, playerId: 'a' }]);
      expect(parts.at(-1)).toEqual({ text: name });
      expect(parts.map(s => s.text).join('')).toBe(activityText(used, language));
    }
  });

  it('keeps equal endpoint names distinct and bank/team/chat content untagged', () => {
    const transfer = event({ type: 'MONEY_TRANSFER', source: { kind: 'PLAYER', playerId: 'a', name: 'An' }, destination: { kind: 'PLAYER', playerId: 'b', name: 'An' }, amount: 12, reason: 'RENT' });
    expect(activitySegments(transfer).filter(s => s.playerId)).toEqual([{ text: 'An', playerId: 'a' }, { text: 'An', playerId: 'b' }]);
    const bank = event({ ...transfer, source: { kind: 'BANK' }, destination: { kind: 'BANK' } } as ActivityEventInput);
    expect(activitySegments(bank).some(s => s.playerId)).toBe(false);
    const chat = event({ type: 'CHAT', senderRole: 'PLAYER', senderPlayerId: 'a', senderName: 'An', message: 'An {playerName}' });
    expect(activitySegments(chat).some(s => s.playerId)).toBe(false);
    expect(activityText(chat)).toBe('An: An {playerName}');
    const win = event({ type: 'GAME_FINISHED', winnerPlayerId: 'a', winnerName: 'An', winnerColor: 'red', winnerCharacterId: null, finalCash: 1, winningTeamName: 'An', winningTeamId: 'TEAM_1' });
    expect(activitySegments(win).some(s => s.playerId)).toBe(false);
  });

  it('covers actor, owner, winner, survivor and rescue references in both locales', () => {
    const cases: Array<[ActivityEventInput, string[]]> = [
      [{ type: 'PLAYER_JOINED', playerId: 'a', playerName: 'A', color: 'red', characterId: null }, ['a']],
      [{ type: 'GAME_STARTED', startingPlayerId: 'a', startingPlayerName: 'A', playerIds: ['a','b'] }, ['a']],
      [{ type: 'DICE_ROLL', playerId: 'a', playerName: 'A', dice1: 1, dice2: 2, total: 3, context: 'JAIL' }, ['a']],
      [{ type: 'TILE_LANDED', playerId: 'a', playerName: 'A', tileID: 1 }, ['a']],
      [{ type: 'PROPERTY_PURCHASE', playerId: 'a', playerName: 'A', tileID: 1, price: 60 }, ['a']],
      [{ type: 'PROPERTY_TRANSFER', from: { kind: 'PLAYER', playerId: 'a', name: 'A' }, to: { kind: 'PLAYER', playerId: 'b', name: 'B' }, tileID: 1, cause: 'VOLUNTARY_TRADE' }, ['a','b']],
      [{ type: 'PROPERTY_DEVELOPMENT', playerId: 'a', playerName: 'A', ownerPlayerId: 'b', ownerName: 'B', tileID: 1, fromHouses: 1, toHouses: 2, action: 'BUILD' }, ['a','b']],
      [{ type: 'JAIL', playerId: 'a', playerName: 'A', action: 'ENTRY' }, ['a']],
      [{ type: 'PLAYER_FINISHED', playerId: 'a', playerName: 'A', reason: 'BANKRUPT', finalCash: 0 }, ['a']],
      [{ type: 'GAME_FINISHED', winnerPlayerId: 'a', winnerName: 'A', winnerColor: 'red', winnerCharacterId: null, finalCash: 5 }, ['a']],
      [{ type: 'TEAM_REVIVE', action: 'REVIVED', playerId: 'a', playerName: 'A', survivorPlayerId: 'b', survivorName: 'B', turnsRemaining: 2 }, ['b','a']],
      [{ type: 'EMERGENCY_RESCUE', action: 'ACCEPTED', debtorPlayerId: 'a', debtorName: 'A', rescuerPlayerId: 'b', rescuerName: 'B', amount: 3 }, ['b','a']],
    ];
    for (const [input, ids] of cases) for (const language of ['vi','en'] as const) {
      expect(activitySegments(event(input), language).filter(s => s.playerId).map(s => s.playerId), input.type).toEqual(ids);
    }
  });
});
