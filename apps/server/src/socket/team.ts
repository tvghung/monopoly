import {
  setGameModeRequestSchema,
  setTeamColorRequestSchema,
  setTeamNameRequestSchema,
  swapTeamRequestSchema,
} from '@monopoly/shared';
import { reviveTeammate, sanitizeName } from '../game';
import { activePlayerIds } from '../rooms';
import type { AppRuntime } from '../services/runtime';
import {
  activeTeamMembers,
  applyTeamColors,
  dedupeTeamMascots,
  resetReady,
} from '../teamLobby';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand, type DomainCommandContext } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

const LOBBY_ONLY = 'Chỉ có thể chỉnh đội trong phòng chờ.';
const TEAM_MODE_ONLY = 'Chỉ có thể chỉnh đội khi chọn chế độ 2v2.';
const HOST_ONLY = 'Chỉ chủ phòng mới có thể thực hiện thao tác này.';

/** The checks every team-lobby command shares: the lobby, the 2v2 mode and (for host commands) the host. */
function requireTeamLobby(context: DomainCommandContext, playerId: string, hostOnly: boolean): void {
  const { room, state } = context;
  if (room.status !== 'LOBBY') throw new CommandError('CONFLICT', LOBBY_ONLY);
  if (hostOnly && room.hostPlayerId !== playerId) throw new CommandError('FORBIDDEN', HOST_ONLY);
  if (state.boardState.gameMode !== 'TEAM_2V2') throw new CommandError('CONFLICT', TEAM_MODE_ONLY);
}

export function registerTeamHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  // Host: Solo <-> 2v2. Every player's Ready is reset when the mode really changes.
  socket.on('set game mode', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(setGameModeRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        if (room.status !== 'LOBBY') {
          throw new CommandError('CONFLICT', 'Chỉ có thể đổi chế độ chơi trong phòng chờ.');
        }
        if (room.hostPlayerId !== actor.playerId) throw new CommandError('FORBIDDEN', 'Chỉ chủ phòng mới có thể đổi chế độ chơi.');
        if (state.boardState.gameMode === request.mode) return;

        state.boardState.gameMode = request.mode;
        const players = activePlayerIds(room.gameSnapshot);
        resetReady(room.gameSnapshot, players);
        if (request.mode === 'TEAM_2V2') {
          // Mascots are drawn in the team colour from now on; two teammates who had picked the same mascot cannot both keep it.
          applyTeamColors(room.gameSnapshot, state);
          dedupeTeamMascots(room.gameSnapshot, state, players);
        }
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  // Host: rename a team. Names never reset Ready.
  socket.on('set team name', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(setTeamNameRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireTeamLobby(context, actor.playerId, true);
        const name = sanitizeName(request.name);
        if (!name) throw new CommandError('INVALID_REQUEST', 'Tên đội không hợp lệ.');
        context.state.boardState.teams[request.teamId].name = name;
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  // Any active member: recolour their own team (never another team's). The new colour must not be the other team's.
  socket.on('set team color', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(setTeamColorRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireTeamLobby(context, actor.playerId, false);
        const { room, state } = context;
        const member = room.gameSnapshot.members[actor.playerId];
        const player = state.players[actor.playerId];
        if (!member || member.membershipStatus !== 'ACTIVE' || !player) {
          throw new CommandError('FORBIDDEN', 'Chỉ thành viên của đội mới có thể đổi màu đội.');
        }
        const own = state.boardState.teams[player.teamId];
        const otherTeamId = player.teamId === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1';
        if (request.color === state.boardState.teams[otherTeamId].color) {
          throw new CommandError('CONFLICT', 'Màu này đã được đội kia chọn.');
        }
        if (request.color === own.color) return;

        own.color = request.color;
        applyTeamColors(room.gameSnapshot, state);
        resetReady(room.gameSnapshot, activeTeamMembers(room.gameSnapshot, state, player.teamId));
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  // Host: exchange two players between the teams. Their colour becomes their new team's; a mascot that now clashes with the
  // new teammate is cleared (the player who stayed keeps theirs); both swapped players must ready up again.
  socket.on('swap team', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(swapTeamRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireTeamLobby(context, actor.playerId, true);
        const { room, state } = context;
        const first = state.players[request.playerId];
        const second = state.players[request.withPlayerId];
        const firstActive = room.gameSnapshot.members[request.playerId]?.membershipStatus === 'ACTIVE';
        const secondActive = room.gameSnapshot.members[request.withPlayerId]?.membershipStatus === 'ACTIVE';
        if (!first || !second || !firstActive || !secondActive) {
          throw new CommandError('CONFLICT', 'Cả hai người chơi phải còn trong phòng chờ.');
        }
        if (first.teamId === second.teamId) {
          throw new CommandError('CONFLICT', 'Hai người chơi đang cùng một đội.');
        }

        [first.teamId, second.teamId] = [second.teamId, first.teamId];
        applyTeamColors(room.gameSnapshot, state);
        const moved = [request.playerId, request.withPlayerId];
        const stayers = activePlayerIds(room.gameSnapshot).filter((playerId) => !moved.includes(playerId));
        dedupeTeamMascots(room.gameSnapshot, state, [...stayers, ...moved]);
        resetReady(room.gameSnapshot, moved);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  // The surviving teammate revives the bankrupt one during their own turn. Cost, windows, turn state and the teammate are all
  // read from the server's own state; the request carries nothing.
  socket.on('revive teammate', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, ({ room, state }) => {
        if (room.status !== 'IN_PROGRESS') {
          throw new CommandError('CONFLICT', 'Ván chơi hiện không nhận thao tác này.');
        }
        if (!state.players[actor.playerId]) {
          throw new CommandError('FORBIDDEN', 'Chỉ người chơi còn trong ván mới có thể hồi sinh đồng đội.');
        }
        const result = reviveTeammate(state, actor.playerId);
        if (!result.ok) throw new CommandError('CONFLICT', result.reason);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
