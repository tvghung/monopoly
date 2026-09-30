import { describe, expect, it } from 'vitest';
import type { RoomPlayerMeta } from '@monopoly/shared';
import { makeRoom } from '../../presentation/testFixtures';
import { selectPlayerCardViewModels } from './playerCardSelectors';

const noPresentation = {
  displayActivePlayerId: null,
  displayBalances: {},
  displayDevelopmentLevels: {},
};

function roomWith(playerCount: 2 | 3 | 4) {
  const room = makeRoom();
  const extra: RoomPlayerMeta[] = [
    { playerId: 'player-c', name: 'Chi', color: 'green', characterId: 'cat', joinOrder: 2, membershipStatus: 'ACTIVE', ready: true, connected: true },
    { playerId: 'player-d', name: 'Dũng', color: 'yellow', characterId: 'penguin', joinOrder: 3, membershipStatus: 'ACTIVE', ready: true, connected: true },
  ];
  room.players.push(...extra.slice(0, playerCount - 2));
  extra.slice(0, playerCount - 2).forEach(player => {
    room.gameState.players[player.playerId] = {
      name: player.name,
      currentTile: 0,
      color: player.color,
      characterId: player.characterId,
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      getOutOfJailCardCount: 0,
    };
    room.gameState.boardState.players.push(player.playerId);
  });
  return room;
}

const select = (
  room: ReturnType<typeof makeRoom>,
  localPlayerId: string | null,
  role: 'PLAYER' | 'SPECTATOR' | null = 'PLAYER',
  presentation: Parameters<typeof selectPlayerCardViewModels>[1] = noPresentation,
) => selectPlayerCardViewModels(room.gameState, presentation, room.players, localPlayerId, role);

describe('selectPlayerCardViewModels', () => {
  it('seats the local player lower-left and the opponents by join order for 2, 3 and 4 players', () => {
    const two = select(roomWith(2), 'player-a');
    expect(two.map(card => [card.playerId, card.slot])).toEqual([['player-a', 'BOTTOM'], ['player-b', 'TOP']]);

    const three = select(roomWith(3), 'player-b');
    expect(Object.fromEntries(three.map(card => [card.playerId, card.slot])))
      .toEqual({ 'player-b': 'BOTTOM', 'player-c': 'TOP', 'player-a': 'LEFT' });

    const four = select(roomWith(4), 'player-c');
    expect(Object.fromEntries(four.map(card => [card.playerId, card.slot])))
      .toEqual({ 'player-c': 'BOTTOM', 'player-d': 'TOP', 'player-a': 'LEFT', 'player-b': 'RIGHT' });
  });

  it('marks only the local player as local, and nobody for a spectator', () => {
    expect(select(roomWith(4), 'player-b').filter(card => card.isLocal).map(card => card.playerId)).toEqual(['player-b']);
    const spectator = select(roomWith(4), 'player-b', 'SPECTATOR');
    expect(spectator.some(card => card.isLocal)).toBe(false);
    expect(spectator.find(card => card.playerId === 'player-a')?.slot).toBe('BOTTOM');
  });

  it('follows the displayed turn, not the authoritative one, and falls back to authoritative when unset', () => {
    const room = roomWith(2);
    expect(select(room, 'player-a').map(card => card.isActive)).toEqual([true, false]);
    const shown = select(room, 'player-a', 'PLAYER', { ...noPresentation, displayActivePlayerId: 'player-b' });
    expect(shown.map(card => card.isActive)).toEqual([false, true]);
  });

  it('shows the displayed balance when there is one and the authoritative balance otherwise', () => {
    const room = roomWith(2);
    room.gameState.players['player-a'].accountBalance = 1200;
    room.gameState.players['player-b'].accountBalance = 1800;
    const cards = select(room, 'player-a', 'PLAYER', { ...noPresentation, displayBalances: { 'player-a': 1500 } });
    expect(cards.find(card => card.playerId === 'player-a')?.displayMoney).toBe(1500);
    expect(cards.find(card => card.playerId === 'player-b')?.displayMoney).toBe(1800);
  });

  it('counts buildings from the displayed levels while the property count follows ownership', () => {
    const room = roomWith(2);
    room.gameState.boardState.ownedProps = {
      1: { id: 'player-a', color: 'red', houses: 4 },
      3: { id: 'player-a', color: 'red', houses: 0 },
      6: { id: 'player-a', color: 'red', houses: 5 },
    };
    // The 3D scene still shows level 2 on tile 1 and no building yet on tile 6.
    const cards = select(room, 'player-a', 'PLAYER', {
      ...noPresentation,
      displayDevelopmentLevels: { 1: 2, 6: 0 },
    });
    const mine = cards.find(card => card.playerId === 'player-a')!;
    expect(mine).toMatchObject({ houses: 2, hotels: 0, propertyCount: 3 });
    const authoritative = select(room, 'player-a').find(card => card.playerId === 'player-a')!;
    expect(authoritative).toMatchObject({ houses: 4, hotels: 1, propertyCount: 3 });
  });

  it('builds the district pips, flags complete districts and counts railroads and utilities', () => {
    const room = roomWith(2);
    room.gameState.boardState.ownedProps = {
      1: { id: 'player-a', color: 'red', houses: 0 },
      3: { id: 'player-a', color: 'red', houses: 0 },
      6: { id: 'player-a', color: 'red', houses: 0 },
      5: { id: 'player-a', color: 'red', houses: 0 },
      12: { id: 'player-a', color: 'red', houses: 0 },
      28: { id: 'player-b', color: 'blue', houses: 0 },
    };
    const mine = select(room, 'player-a').find(card => card.playerId === 'player-a')!;
    expect(mine.groupPips.map(pip => pip.group)).toEqual([
      'brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue',
    ]);
    expect(mine.groupPips[0]).toEqual({ group: 'brown', total: 2, owned: 2, complete: true });
    expect(mine.groupPips[1]).toEqual({ group: 'lightblue', total: 3, owned: 1, complete: false });
    expect(mine.groupPips[2]).toMatchObject({ owned: 0, complete: false });
    expect(mine).toMatchObject({ railroadCount: 1, utilityCount: 1, propertyCount: 5 });
  });

  it('reports jail rounds, jail-free cards, offline players and the turn recovery deadline', () => {
    const room = roomWith(2);
    room.gameState.players['player-b'].isJail = true;
    room.gameState.players['player-b'].jailOpponentRoundsElapsed = 1;
    room.players[1].connected = false;
    room.gameState.boardState.turnRecovery = { playerId: 'player-b', deadlineAt: '2026-09-30T10:00:00.000Z' };
    const cards = select(room, 'player-a');
    const opponent = cards.find(card => card.playerId === 'player-b')!;
    expect(opponent).toMatchObject({
      isInJail: true,
      jailRoundsElapsed: 1,
      jailFreeCardCount: 1,
      isConnected: false,
      recoveryDeadlineAt: '2026-09-30T10:00:00.000Z',
    });
    expect(cards.find(card => card.playerId === 'player-a')?.recoveryDeadlineAt).toBeNull();
  });

  it('keeps left and bankrupt players in their seat with their lifecycle flags', () => {
    const room = roomWith(4);
    room.gameState.boardState.finishedPlayers['player-c'] = {
      name: 'Chi', color: 'green', characterId: 'cat', reason: 'BANKRUPT', accountBalance: 0,
    };
    room.gameState.boardState.finishedPlayers['player-d'] = {
      name: 'Dũng', color: 'yellow', characterId: 'penguin', reason: 'LEFT', accountBalance: 300,
    };
    delete room.gameState.players['player-c'];
    delete room.gameState.players['player-d'];
    const cards = select(room, 'player-a');
    const bankrupt = cards.find(card => card.playerId === 'player-c')!;
    const left = cards.find(card => card.playerId === 'player-d')!;
    expect(bankrupt).toMatchObject({ isBankrupt: true, hasLeft: false, slot: 'LEFT' });
    expect(left).toMatchObject({ hasLeft: true, isBankrupt: false, slot: 'RIGHT', isConnected: false });
    expect(left.displayMoney).toBe(300);
  });
});
