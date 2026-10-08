import {
  moveToSeatRequestSchema,
  requestSeatSwapRequestSchema,
  respondSeatSwapRequestSchema,
  seatHolderAt,
  setGameModeRequestSchema,
  setTeamColorRequestSchema,
  setTeamNameRequestSchema,
} from '@monopoly/shared';
import { sanitizeName } from '../game';
import { reviveTeammateCommand, runGameCommand } from '../commands/gameplay';
import { activePlayerIds, isBotMember, lobbySeatHolders } from '../rooms';
import type { AppRuntime } from '../services/runtime';
import {
  activeTeamMembers,
  applyTeamColors,
  dedupeTeamMascots,
  movePlayerToSeat,
  resetReady,
  swapPlayerSeats,
} from '../teamLobby';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand, type DomainCommandContext } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

const LOBBY_ONLY = 'Chỉ có thể chỉnh đội trong phòng chờ.';
const TEAM_MODE_ONLY = 'Chỉ có thể chỉnh đội khi chọn chế độ 2v2.';

/** The checks every team-lobby command shares: the lobby and the 2v2 mode. */
function requireTeamLobby(context: DomainCommandContext): void {
  const { room, state } = context;
  if (room.status !== 'LOBBY') throw new CommandError('CONFLICT', LOBBY_ONLY);
  if (state.boardState.gameMode !== 'TEAM_2V2') throw new CommandError('CONFLICT', TEAM_MODE_ONLY);
}

/** The actor as an active member of the lobby, with their player record; a command by anyone else is refused. */
function requireLobbyMember(context: DomainCommandContext, playerId: string, refusal: string) {
  const { room, state } = context;
  const member = room.gameSnapshot.members[playerId];
  const player = state.players[playerId];
  if (!member || member.membershipStatus !== 'ACTIVE' || !player) throw new CommandError('FORBIDDEN', refusal);
  return player;
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
        // Seat-swap requests only exist in a 2v2 lobby.
        state.boardState.seatSwapRequests = [];
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

  // Any active member: rename their own team (never the other one; the host has no say over the opposing team). Names never
  // reset Ready.
  socket.on('set team name', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(setTeamNameRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireTeamLobby(context);
        const player = requireLobbyMember(context, actor.playerId, 'Chỉ thành viên của đội mới có thể đổi tên đội.');
        const name = sanitizeName(request.name);
        if (!name) throw new CommandError('INVALID_REQUEST', 'Tên đội không hợp lệ.');
        context.state.boardState.teams[player.teamId].name = name;
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
        requireTeamLobby(context);
        const { room, state } = context;
        const player = requireLobbyMember(context, actor.playerId, 'Chỉ thành viên của đội mới có thể đổi màu đội.');
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

  // The actor takes a seat nobody holds (the other team's, or the other seat of their own). Moving to the other team changes
  // their colour, may clear a mascot that clashes with the new teammate and resets their Ready; the seat is theirs at once.
  socket.on('move to seat', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(moveToSeatRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireTeamLobby(context);
        const { room, state } = context;
        const player = requireLobbyMember(context, actor.playerId, 'Chỉ người chơi trong phòng chờ mới có thể đổi chỗ.');
        if (player.teamId === request.teamId && player.teamSlot === request.teamSlot) {
          throw new CommandError('CONFLICT', 'Bạn đang ngồi ở chỗ này.');
        }
        if (seatHolderAt(lobbySeatHolders(room.gameSnapshot), request.teamId, request.teamSlot)) {
          throw new CommandError('CONFLICT', 'Chỗ này vừa có người ngồi. Hãy chọn lại.');
        }
        movePlayerToSeat(room.gameSnapshot, state, actor.playerId, request.teamId, request.teamSlot);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  // The actor asks another player to exchange seats. Nothing moves until that player accepts; a player has one open request
  // at a time, so asking someone else replaces the earlier question.
  socket.on('request seat swap', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(requestSeatSwapRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireTeamLobby(context);
        const { room, state } = context;
        requireLobbyMember(context, actor.playerId, 'Chỉ người chơi trong phòng chờ mới có thể đổi chỗ.');
        if (request.targetPlayerId === actor.playerId) {
          throw new CommandError('CONFLICT', 'Không thể đổi chỗ với chính mình.');
        }
        const target = room.gameSnapshot.members[request.targetPlayerId];
        if (!target || target.membershipStatus !== 'ACTIVE' || !state.players[request.targetPlayerId]) {
          throw new CommandError('CONFLICT', 'Người chơi này không còn trong phòng chờ.');
        }
        // A bot cannot answer a question and never minds where it sits: it agrees at once.
        if (isBotMember(room.gameSnapshot, request.targetPlayerId)) {
          swapPlayerSeats(room.gameSnapshot, state, actor.playerId, request.targetPlayerId);
          return;
        }
        state.boardState.seatSwapRequests = [
          ...state.boardState.seatSwapRequests.filter((open) => open.requesterPlayerId !== actor.playerId),
          { requesterPlayerId: actor.playerId, targetPlayerId: request.targetPlayerId },
        ];
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  // The requester withdraws their open request. Nothing to withdraw is not an error: the target may have answered already.
  socket.on('cancel seat swap', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireTeamLobby(context);
        const { state } = context;
        state.boardState.seatSwapRequests = state.boardState.seatSwapRequests.filter(
          (open) => open.requesterPlayerId !== actor.playerId,
        );
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  // The target answers the request addressed to them. Accepting exchanges the two seats as they are right now; declining only
  // closes the request. The requester is named in the payload, but only a request that really is addressed to the actor counts.
  socket.on('respond seat swap', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(respondSeatSwapRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const committed = await commitRoomCommand(runtime, actor.roomId, (context) => {
        requireTeamLobby(context);
        const { room, state } = context;
        requireLobbyMember(context, actor.playerId, 'Chỉ người chơi trong phòng chờ mới có thể trả lời đổi chỗ.');
        const open = state.boardState.seatSwapRequests.find((candidate) => (
          candidate.requesterPlayerId === request.requesterPlayerId && candidate.targetPlayerId === actor.playerId
        ));
        if (!open) throw new CommandError('CONFLICT', 'Yêu cầu đổi chỗ này không còn.');
        if (request.accept) {
          swapPlayerSeats(room.gameSnapshot, state, open.requesterPlayerId, actor.playerId);
        } else {
          state.boardState.seatSwapRequests = state.boardState.seatSwapRequests.filter((candidate) => candidate !== open);
        }
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
      const { room } = await runGameCommand(io, runtime, reviveTeammateCommand, actor.roomId, actor.playerId, undefined, {
        authority: actor,
      });
      acknowledge(successAck(room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
