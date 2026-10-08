import { randomUUID } from 'node:crypto';
import { MAX_BOTS_PER_ROOM, type GameState, type PlayerId } from '@monopoly/shared';
import { recordActivityEvent, sendToLog } from '../game';
import {
  activeBotIds,
  activePlayerIds,
  chooseBotCharacter,
  chooseJoinSeat,
  createFreshPlayer,
  MAX_PLAYERS,
  nextAvailableColor,
  nextBotNumber,
  type RoomSnapshot,
} from '../rooms';
import { dropSeatSwapRequestsOf } from '../teamLobby';

export type AddBotRefusal = 'ROOM_FULL' | 'BOT_LIMIT' | 'NO_SEAT';

/** The room as the command sees it: members from the snapshot, game state from the command's working copy. */
const workingView = (snapshot: RoomSnapshot, state: GameState): RoomSnapshot => ({
  members: snapshot.members,
  nextJoinOrder: snapshot.nextJoinOrder,
  gameState: state,
});

/**
 * Seats one bot in a free seat of a lobby: the team and seat a joining human would get, the next free colour (the team colour in
 * 2v2), the lowest free `Bot N` name and a free mascot. The bot is Ready at once. Returns the new id, or why there is no seat.
 */
export function addBotSeat(
  snapshot: RoomSnapshot,
  state: GameState,
  botId: PlayerId = randomUUID(),
): { ok: true; playerId: PlayerId } | { ok: false; reason: AddBotRefusal } {
  const view = workingView(snapshot, state);
  if (activePlayerIds(view).length >= MAX_PLAYERS) return { ok: false, reason: 'ROOM_FULL' };
  if (activeBotIds(view).length >= MAX_BOTS_PER_ROOM) return { ok: false, reason: 'BOT_LIMIT' };
  const number = nextBotNumber(view);
  const seat = chooseJoinSeat(view);
  const { gameMode, teams } = state.boardState;
  const color = seat
    ? gameMode === 'TEAM_2V2' ? teams[seat.teamId].color : nextAvailableColor(view)
    : null;
  if (number === null) return { ok: false, reason: 'BOT_LIMIT' };
  if (!seat || !color) return { ok: false, reason: 'NO_SEAT' };

  const name = `Bot ${String(number)}`;
  snapshot.members[botId] = {
    joinOrder: snapshot.nextJoinOrder,
    ready: true,
    membershipStatus: 'ACTIVE',
    kind: 'BOT',
  };
  snapshot.nextJoinOrder += 1;
  state.players[botId] = createFreshPlayer(name, color, null, seat.teamId, seat.teamSlot);
  state.players[botId].characterId = chooseBotCharacter(view, botId, color);
  state.boardState.players = activePlayerIds(view);
  recordActivityEvent(state, {
    type: 'PLAYER_JOINED',
    playerId: botId,
    playerName: name,
    color,
    characterId: state.players[botId].characterId,
  });
  sendToLog(state, `${name} đã vào phòng.`);
  return { ok: true, playerId: botId };
}

/** Removes a lobby bot seat and every open seat-swap request that names it. */
export function removeBotSeat(snapshot: RoomSnapshot, state: GameState, botId: PlayerId): void {
  const name = state.players[botId]?.name ?? 'Bot';
  delete snapshot.members[botId];
  delete state.players[botId];
  state.boardState.players = activePlayerIds(workingView(snapshot, state));
  dropSeatSwapRequestsOf(state, [botId]);
  sendToLog(state, `${name} đã rời phòng.`);
}
