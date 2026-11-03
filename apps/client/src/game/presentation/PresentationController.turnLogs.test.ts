import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityEventInput, PublicRoomState } from '@monopoly/shared';
import { PresentationController } from './PresentationController';
import { cloneRoom, makeTeamRoom } from './testFixtures';

const controllers: PresentationController[] = [];
afterEach(() => { for (const controller of controllers.splice(0)) controller.dispose(); });
const create = (room: PublicRoomState) => {
  const controller = new PresentationController();
  controllers.push(controller);
  controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
  return controller;
};
function append(room: PublicRoomState, input: ActivityEventInput) {
  const feed = room.gameState.boardState.activityFeed;
  const sequence = ++feed.sequence;
  feed.events.push({ ...input, sequence, eventId: 'activity-' + sequence, occurredAt: '2026-11-03T00:00:00Z' });
}
function moving(room: PublicRoomState) {
  const next = cloneRoom(room);
  const { boardState, players } = next.gameState;
  const id = boardState.currentPlayer.id;
  boardState.diceValue = { dice1: 1, dice2: 1 };
  boardState.rollSequence++;
  boardState.currentPlayer.hasMoved = true;
  players[id].currentTile = (players[id].currentTile + 2) % 40;
  append(next, { type: 'POWER_UP_RECEIVED', playerId: id, playerName: players[id].name });
  boardState.logs.push(id + ' received');
  return next;
}
function handoff(room: PublicRoomState, id: string) {
  const next = cloneRoom(room);
  const actor = room.gameState.boardState.currentPlayer.id;
  append(next, { type: 'POWER_UP_USED', playerId: actor, playerName: room.gameState.players[actor].name, definitionId: 'U02', cardName: 'Tăng Tốc' });
  next.gameState.turnInfo = {};
  next.gameState.boardState.paymentShortfall = null;
  next.gameState.boardState.currentPlayer = { id, hasMoved: false };
  next.gameState.boardState.turnNumber++;
  next.gameState.boardState.logs.push(actor + ' finished');
  return next;
}

describe('OB-15 committed turn log boundaries', () => {
  it.each(['SOLO', 'TEAM_2V2'] as const)('publishes A/B/C/D at each handoff while the animation queue never idles (%s)', mode => {
    let room = makeTeamRoom();
    room.gameState.boardState.gameMode = mode;
    const controller = create(room);
    for (const nextId of ['player-b', 'player-c', 'player-d', 'player-a']) {
      const roll = moving(room);
      const previousIds = controller.getState().displayActivity.map(e => e.eventId);
      controller.acceptRoomSnapshot(roll, 'LIVE_UPDATE');
      expect(controller.queue.getStatus()).toBe('playing');
      expect(controller.getState().displayActivity.map(e => e.eventId)).toEqual(previousIds);
      room = handoff(roll, nextId);
      controller.acceptRoomSnapshot(room, 'LIVE_UPDATE');
      expect(controller.queue.getStatus()).toBe('playing');
      expect(controller.getState().displayActivity).toEqual(room.gameState.boardState.activityFeed.events);
    }
    const shown = controller.getState().displayActivity;
    expect(new Set(shown.map(e => e.eventId)).size).toBe(shown.length);
    expect(shown.map(e => e.sequence)).toEqual([1,2,3,4,5,6,7,8]);
  });

  it.each(['purchase', 'card', 'payment'] as const)('keeps the next turn %s tail gated without hiding the completed prefix', pending => {
    const initial = makeTeamRoom();
    const controller = create(initial);
    const roll = moving(initial);
    controller.acceptRoomSnapshot(roll, 'LIVE_UPDATE');
    const ended = handoff(roll, 'player-b');
    controller.acceptRoomSnapshot(ended, 'LIVE_UPDATE');
    const next = moving(ended);
    if (pending === 'purchase') next.gameState.turnInfo.pendingLandingDecision = { kind: 'PURCHASE', operationId: 'buy', playerId: 'player-b', tileID: 7, price: 100 };
    if (pending === 'card') next.gameState.turnInfo.pendingCardInteraction = { operationId: 'card', playerId: 'player-b', turnNumber: 2, deck: 'chance', sourceTile: 7, stage: 'REVEALED', revealedCardId: 'chance-dividend', continuation: { playerId: 'player-b', turnNumber: 2 }, deadlineAt: '2026-11-03T00:01:00Z' };
    if (pending === 'payment') next.gameState.boardState.paymentShortfall = { debtorPlayerId: 'player-b', creditor: 'BANK', amount: 10, remainingAmount: 10, source: { kind: 'TAX', tileID: 4 }, actionDeadlineAt: '2026-11-03T00:01:00Z', remainingClaimCount: 1, rescue: null };
    controller.acceptRoomSnapshot(next, 'LIVE_UPDATE');
    expect(controller.getState().displayActivity).toEqual(ended.gameState.boardState.activityFeed.events);
    const endNext = handoff(next, 'player-c');
    controller.acceptRoomSnapshot(endNext, 'LIVE_UPDATE');
    expect(controller.getState().displayActivity).toEqual(endNext.gameState.boardState.activityFeed.events);
  });

  it('publishes a same-player turn-number handoff and terminal game tail while paused', () => {
    const initial = makeTeamRoom();
    const controller = create(initial);
    controller.queue.pause();
    const roll = moving(initial);
    controller.acceptRoomSnapshot(roll, 'LIVE_UPDATE');
    const skipped = handoff(roll, 'player-a');
    controller.acceptRoomSnapshot(skipped, 'LIVE_UPDATE');
    expect(controller.getState().displayActivity).toEqual(skipped.gameState.boardState.activityFeed.events);
    const last = moving(skipped);
    controller.acceptRoomSnapshot(last, 'LIVE_UPDATE');
    const finished = cloneRoom(last);
    finished.status = 'FINISHED';
    append(finished, { type: 'GAME_FINISHED', winnerPlayerId: 'player-a', winnerName: 'An', winnerColor: 'red', winnerCharacterId: 'dog', finalCash: 1500 });
    controller.acceptRoomSnapshot(finished, 'LIVE_UPDATE');
    expect(controller.getState().displayActivity).toEqual(finished.gameState.boardState.activityFeed.events);
  });

  it('preserves legacy-only lines at handoff and rejects duplicate/older live updates', () => {
    const initial = makeTeamRoom();
    const controller = create(initial);
    const roll = moving(initial);
    roll.gameState.boardState.activityFeed = { sequence: 0, events: [] };
    controller.acceptRoomSnapshot(roll, 'LIVE_UPDATE');
    const ended = handoff(roll, 'player-b');
    ended.gameState.boardState.activityFeed = { sequence: 0, events: [] };
    controller.acceptRoomSnapshot(ended, 'LIVE_UPDATE');
    expect(controller.getState().displayLogs).toEqual(ended.gameState.boardState.logs);
    expect(controller.acceptRoomSnapshot(ended, 'LIVE_UPDATE')).toBe(false);
    expect(controller.acceptRoomSnapshot(roll, 'LIVE_UPDATE')).toBe(false);
    controller.acceptRoomSnapshot(ended, 'SPECTATOR_SYNC');
    expect(controller.getState().displayLogs).toEqual(ended.gameState.boardState.logs);
  });
});


it.each(['LEFT', 'BANKRUPT'] as const)('OB-15 releases completed history when the moving player is removed (%s)', reason => {
  const initial = makeTeamRoom();
  const controller = create(initial);
  const roll = moving(initial);
  controller.acceptRoomSnapshot(roll, 'LIVE_UPDATE');
  const removed = handoff(roll, 'player-b');
  const player = removed.gameState.players['player-a'];
  removed.gameState.boardState.finishedPlayers['player-a'] = { name: player.name, color: player.color, characterId: player.characterId, teamId: player.teamId, reason, accountBalance: 0 };
  delete removed.gameState.players['player-a'];
  removed.gameState.boardState.players = removed.gameState.boardState.players.filter(id => id !== 'player-a');
  append(removed, { type: 'PLAYER_FINISHED', playerId: 'player-a', playerName: player.name, reason, finalCash: 0 });
  controller.acceptRoomSnapshot(removed, 'LIVE_UPDATE');
  expect(controller.getState().displayActivity).toEqual(removed.gameState.boardState.activityFeed.events);
  expect(controller.getState().displayPositions['player-a']).toBeUndefined();
});


it('OB-15 keeps an active next-turn tail held even if it creates no animation event', () => {
  const initial = makeTeamRoom();
  const controller = create(initial);
  const rolled = moving(initial);
  controller.acceptRoomSnapshot(rolled, 'LIVE_UPDATE');
  const ended = handoff(rolled, 'player-b');
  controller.acceptRoomSnapshot(ended, 'LIVE_UPDATE');
  const pending = cloneRoom(ended);
  pending.gameState.boardState.currentPlayer.hasMoved = true;
  pending.gameState.turnInfo.pendingLandingDecision = { kind: 'PURCHASE', operationId: 'no-motion', playerId: 'player-b', tileID: 6, price: 100 };
  append(pending, { type: 'POWER_UP_RECEIVED', playerId: 'player-b', playerName: 'Bình' });
  controller.acceptRoomSnapshot(pending, 'LIVE_UPDATE');
  expect(controller.getState().displayActivity).toEqual(ended.gameState.boardState.activityFeed.events);
  const endNext = handoff(pending, 'player-c');
  controller.acceptRoomSnapshot(endNext, 'LIVE_UPDATE');
  expect(controller.getState().displayActivity).toEqual(endNext.gameState.boardState.activityFeed.events);
});
