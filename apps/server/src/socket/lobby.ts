import { randomUUID } from 'node:crypto';
import {
  getAppearanceCombinationKey,
  kickPlayerRequestSchema,
  setAppearanceRequestSchema,
  setReadyRequestSchema,
  type CharacterId,
  type GameState,
  type LeaveRoomResult,
  type OfferResult,
  type PlayerColorId,
  type RemovedFromRoomInfo,
} from '@monopoly/shared';
import {
  chooseStartingPlayer,
  closeReviveWindow,
  createShuffledDecks,
  removePlayerFromGame,
  resumePaymentContinuation,
  rotateSeatOrder,
  sendToLog,
  startTeamMatch,
  surrenderPlayerToBank,
} from '../game';
import {
  activeHumanIds,
  activePlayerIds,
  createFreshPlayer,
  isBotMember,
  MAX_PLAYERS,
  memberKind,
  MIN_PLAYERS,
  remainingHumanIds,
  type RoomSnapshot,
  freshState,
} from '../rooms';
import { isSeatPresent } from '../services/presence';
import {
  activeTeamMembers,
  dropSeatSwapRequestsOf,
  getTeamStartBlockReason,
  hasTeamMascotConflict,
  normalizeTeamSlots,
} from '../teamLobby';
import { paymentTimingOptions, type AppRuntime } from '../services/runtime';
import type { RoomRecord, TradeOfferRecord } from '../persistence';
import { projectPrivateOffer } from '../services/privateOffers';
import { emitCancelledOffers } from '../services/offerInvalidation';
import { recordActivityEvent } from '../game/activity';
import { requirePlayer } from './authority';
import {
  broadcastRoom,
  privatePlayerRoomName,
  publicRoomName,
} from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

/**
 * Who hosts after the host leaves: the lowest join order among the members that stay. During a game only an active seat can
 * host; once it is over every member that stayed can, bankrupt players included, so the replay always has a host.
 */
function successorHost(
  room: Pick<RoomRecord<RoomSnapshot>, 'status' | 'gameSnapshot'>,
  leavingPlayerId: string,
): string | null {
  const members = Object.entries(room.gameSnapshot.members)
    .filter(([playerId, member]) => (
      playerId !== leavingPlayerId && member.membershipStatus !== 'LEFT' && memberKind(member) === 'HUMAN'
    ))
    .sort(([, left], [, right]) => left.joinOrder - right.joinOrder);
  const eligible = room.status === 'FINISHED'
    ? members
    : members.filter(([, member]) => member.membershipStatus === 'ACTIVE');
  return eligible[0]?.[0] ?? null;
}

function hasAppearanceCombinationConflict(
  room: RoomSnapshot,
  state: GameState,
  playerId: string,
  characterId: CharacterId | null,
  color: PlayerColorId,
): boolean {
  const key = getAppearanceCombinationKey(characterId, color);
  if (key === null) return false;
  return activePlayerIds(room).some(candidateId => {
    if (candidateId === playerId) return false;
    const candidate = state.players[candidateId];
    return candidate !== undefined
      && getAppearanceCombinationKey(candidate.characterId, candidate.color) === key;
  });
}

export function registerLobbyHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('set appearance', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(setAppearanceRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        if (room.status !== 'LOBBY') {
          throw new CommandError('GAME_ALREADY_STARTED', 'Appearance can only change in the lobby.');
        }
        const member = room.gameSnapshot.members[playerId];
        const player = state.players[playerId];
        if (!member || member.membershipStatus !== 'ACTIVE' || !player) {
          throw new CommandError('FORBIDDEN', 'Only an active player can change appearance.');
        }

        const teamMode = state.boardState.gameMode === 'TEAM_2V2';
        if (teamMode && request.color !== undefined) {
          // In 2v2 the mascot is always drawn in the team colour, which the team (not the player) chooses.
          throw new CommandError('CONFLICT', 'Trong chế độ 2v2, màu mascot là màu của đội.');
        }
        const nextCharacterId = request.characterId ?? player.characterId;
        const nextColor = request.color ?? player.color;
        if (teamMode && hasTeamMascotConflict(room.gameSnapshot, state, playerId, nextCharacterId)) {
          throw new CommandError('CONFLICT', 'Đồng đội của bạn đã chọn mascot này.');
        }
        if (hasAppearanceCombinationConflict(room.gameSnapshot, state, playerId, nextCharacterId, nextColor)) {
          throw new CommandError('CONFLICT', 'Tổ hợp mascot và màu này đã được người chơi khác chọn.');
        }

        const changed = (request.characterId !== undefined && request.characterId !== player.characterId)
          || (request.color !== undefined && request.color !== player.color);
        if (request.characterId !== undefined) player.characterId = request.characterId;
        if (request.color !== undefined) player.color = request.color;
        if (changed) member.ready = false;
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('set ready', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(setReadyRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        if (room.status !== 'LOBBY') {
          throw new CommandError('CONFLICT', 'Ready state can only change in the lobby.');
        }
        const member = room.gameSnapshot.members[playerId];
        if (!member || member.membershipStatus !== 'ACTIVE') {
          throw new CommandError('FORBIDDEN', 'Only an active player can become ready.');
        }
        const player = state.players[playerId];
        if (request.ready && (!player || player.characterId === null)) {
          throw new CommandError('CONFLICT', 'Vui lòng chọn nhân vật trước khi sẵn sàng.');
        }
        if (
          request.ready
          && state.boardState.gameMode === 'TEAM_2V2'
          && hasTeamMascotConflict(room.gameSnapshot, state, playerId, player?.characterId ?? null)
        ) {
          throw new CommandError('CONFLICT', 'Đồng đội của bạn đã chọn mascot này.');
        }
        if (
          request.ready
          && player
          && hasAppearanceCombinationConflict(
            room.gameSnapshot,
            state,
            playerId,
            player.characterId,
            player.color,
          )
        ) {
          throw new CommandError('CONFLICT', 'Tổ hợp mascot và màu này đã được người chơi khác chọn.');
        }
        member.ready = request.ready;
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('start game', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state, now }) => {
        if (room.status !== 'LOBBY') {
          throw new CommandError('GAME_ALREADY_STARTED', 'The game has already started.');
        }
        if (room.hostPlayerId !== playerId) {
          throw new CommandError('FORBIDDEN', 'Only the host can start the game.');
        }
        const players = activePlayerIds(room.gameSnapshot);
        const teamMode = state.boardState.gameMode === 'TEAM_2V2';
        if (teamMode) {
          // 2v2 starts only with exactly two teams of two (the Ready, mascot and connection checks below still apply).
          const teamReason = getTeamStartBlockReason(room.gameSnapshot, state);
          if (teamReason) throw new CommandError('CONFLICT', teamReason);
        } else if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
          throw new CommandError(
            'CONFLICT',
            `A game requires between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`,
          );
        }
        if (activeHumanIds(room.gameSnapshot).length === 0) {
          throw new CommandError('CONFLICT', 'A game needs at least one human player.');
        }
        if (players.some((id) => !room.gameSnapshot.members[id]?.ready)) {
          throw new CommandError('CONFLICT', 'Every active player must be ready.');
        }
        const activePlayers = players.map(id => state.players[id]);
        if (activePlayers.some(player => !player || player.characterId === null)) {
          throw new CommandError('CONFLICT', 'Mọi người chơi phải chọn nhân vật trước khi bắt đầu.');
        }
        const appearanceKeys = activePlayers
          .filter((player): player is NonNullable<typeof player> => player !== undefined)
          .map(player => getAppearanceCombinationKey(player.characterId, player.color));
        if (
          appearanceKeys.length !== activePlayers.length
          || appearanceKeys.some(key => key === null)
          || new Set(appearanceKeys).size !== appearanceKeys.length
        ) {
          throw new CommandError(
            'CONFLICT',
            'Mỗi người chơi phải có một tổ hợp mascot và màu riêng trước khi bắt đầu.',
          );
        }
        if (players.some((id) => !isSeatPresent(runtime.connections, room.gameSnapshot, id))) {
          throw new CommandError('CONFLICT', 'Every active player must be connected.');
        }

        room.status = 'IN_PROGRESS';
        state.boardState.gameStarted = true;
        state.boardState.seatSwapRequests = [];
        state.boardState.gameStartedAt = state.boardState.gameStartedAt ?? now.toISOString();
        state.boardState.matchId = randomUUID();
        const startingRoll = chooseStartingPlayer(players);
        if (teamMode) {
          // Dice still pick who starts, but the teams alternate (A1, B1, A2, B2): teammates are never adjacent.
          startTeamMatch(state, startingRoll.winner, {
            TEAM_1: activeTeamMembers(room.gameSnapshot, state, 'TEAM_1'),
            TEAM_2: activeTeamMembers(room.gameSnapshot, state, 'TEAM_2'),
          });
        } else {
          state.boardState.players = rotateSeatOrder(players, startingRoll.winner);
        }
        state.boardState.currentPlayer = {
          id: startingRoll.winner,
          hasMoved: false,
          // v3 does not persist a doubles streak; normal doubles never grant
          // an extra roll.
        };
        state.boardState.turnNumber = 1;
        state.boardState.turnRecovery = null;
        state.turnInfo = {};
        state.privateState.decks = createShuffledDecks();
        recordActivityEvent(state, {
          type: 'GAME_STARTED',
          playerIds: [...players],
          startingPlayerId: startingRoll.winner,
          startingPlayerName: state.players[startingRoll.winner].name,
        });
        for (const round of startingRoll.rounds) {
          const rollSummary = round.contenders.map((id) => {
            const dice = round.rolls[id];
            return `${state.players[id].name}: ${dice.dice1} + ${dice.dice2}`;
          }).join(', ');
          sendToLog(state, `Tung xúc xắc chọn người đi đầu — ${rollSummary}.`);
        }
        sendToLog(
          state,
          `Ván Cờ Tỷ Phú Việt Nam bắt đầu. ${state.players[startingRoll.winner].name} đi trước!`,
        );
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('play again', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        if (room.status !== 'FINISHED') {
          throw new CommandError('CONFLICT', 'Chỉ có thể chơi lại sau khi ván đã kết thúc.');
        }
        if (room.hostPlayerId !== actor.playerId) {
          throw new CommandError('FORBIDDEN', 'Chỉ chủ phòng mới có thể bắt đầu ván mới.');
        }

        const eligible = Object.entries(room.gameSnapshot.members)
          .filter(([, member]) => member.membershipStatus !== 'LEFT')
          .sort(([, left], [, right]) => left.joinOrder - right.joinOrder)
          .map(([playerId, member]) => ({
            playerId,
            member,
            identity: state.players[playerId] ?? state.boardState.finishedPlayers[playerId],
          }));
        if (!eligible.some(candidate => candidate.playerId === actor.playerId)) {
          throw new CommandError('FORBIDDEN', 'Chỉ người chơi đủ điều kiện mới có thể chơi lại.');
        }
        if (eligible.some(candidate => !candidate.identity)) {
          throw new CommandError('CONFLICT', 'Không thể khôi phục đầy đủ danh tính người chơi.');
        }

        const pendingOffers = await transaction.tradeOffers.listPendingForRoom(actor.roomId);
        const cancelledOffers = (await Promise.all(
          pendingOffers.map(offer => transaction.tradeOffers.resolve(offer.id, 'CANCELLED', now)),
        )).filter((offer): offer is TradeOfferRecord => offer !== null);

        const nextJoinOrder = room.gameSnapshot.nextJoinOrder;
        // The lobby configuration survives the replay: game mode, team names and colours here, each player's team below.
        const { gameMode, teams } = state.boardState;
        const reset = freshState();
        state.boardState = reset.boardState;
        state.boardState.gameMode = gameMode;
        state.boardState.teams = teams;
        state.players = reset.players;
        state.turnInfo = reset.turnInfo;
        state.privateState = reset.privateState;
        room.gameSnapshot.members = {};
        room.gameSnapshot.nextJoinOrder = nextJoinOrder;

        for (const candidate of eligible) {
          const identity = candidate.identity;
          if (!identity) continue;
          room.gameSnapshot.members[candidate.playerId] = {
            joinOrder: candidate.member.joinOrder,
            // A bot is Ready again at once (lobby normalisation); every human readies up again.
            ready: false,
            membershipStatus: 'ACTIVE',
            ...(candidate.member.kind === 'BOT' ? { kind: 'BOT' as const } : {}),
          };
          state.players[candidate.playerId] = createFreshPlayer(
            identity.name,
            gameMode === 'TEAM_2V2' ? teams[identity.teamId].color : identity.color,
            identity.characterId,
            identity.teamId,
          );
          state.boardState.players.push(candidate.playerId);
        }
        // The replayed lobby lays each team out again by join order (every member starts on seat 0 until then).
        normalizeTeamSlots(room.gameSnapshot, state);
        room.status = 'LOBBY';
        room.hostPlayerId = room.gameSnapshot.members[actor.playerId]
          ? actor.playerId
          : eligible[0]?.playerId ?? null;
        if (!room.hostPlayerId) {
          throw new CommandError('CONFLICT', 'Không thể xác định chủ phòng mới.');
        }
        return cancelledOffers;
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      emitCancelledOffers(io, committed.room, committed.result, now);
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  // Host only, lobby only: sends another player out of the room. Their session is revoked in the same transaction, so the old
  // token can never bring them back as that player; they may join again from the room code like anyone else.
  socket.on('kick player', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(kickPlayerRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        if (room.status !== 'LOBBY') {
          throw new CommandError('CONFLICT', 'Chỉ có thể mời người chơi ra khỏi phòng trong phòng chờ.');
        }
        if (room.hostPlayerId !== actor.playerId) {
          throw new CommandError('FORBIDDEN', 'Chỉ chủ phòng mới có thể mời người chơi ra khỏi phòng.');
        }
        if (request.playerId === actor.playerId) {
          throw new CommandError('CONFLICT', 'Chủ phòng không thể tự mời mình ra khỏi phòng. Hãy chọn Rời phòng.');
        }
        const member = room.gameSnapshot.members[request.playerId];
        const player = state.players[request.playerId];
        if (!member || member.membershipStatus !== 'ACTIVE' || !player) {
          throw new CommandError('CONFLICT', 'Người chơi này không còn trong phòng.');
        }
        if (isBotMember(room.gameSnapshot, request.playerId)) {
          throw new CommandError('CONFLICT', 'Đây là ghế Bot: hãy dùng nút Xóa Bot.');
        }

        await transaction.playerSessions.revokeByPlayer(actor.roomId, request.playerId, now);
        delete room.gameSnapshot.members[request.playerId];
        delete state.players[request.playerId];
        state.boardState.players = activePlayerIds(room.gameSnapshot);
        dropSeatSwapRequestsOf(state, [request.playerId]);
        sendToLog(state, `${player.name} đã được chủ phòng mời ra khỏi phòng.`);
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');

      // The removed player's connection (if any) learns why, leaves the room channels and is no longer theirs.
      const kicked = runtime.connections.get(request.playerId);
      if (kicked) {
        runtime.connections.deactivate(request.playerId, kicked.socketId, kicked.generation);
        const kickedSocket = io.sockets.sockets.get(kicked.socketId);
        if (kickedSocket) {
          const info: RemovedFromRoomInfo = {
            code: 'REMOVED_BY_HOST',
            message: 'Chủ phòng đã mời bạn ra khỏi phòng.',
          };
          kickedSocket.emit('removed from room', info);
          await Promise.all([
            kickedSocket.leave(privatePlayerRoomName(request.playerId)),
            kickedSocket.leave(publicRoomName(actor.roomId)),
          ]);
          kickedSocket.data = {};
        }
      }
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('leave room', async (acknowledge) => {
    try {
      if (socket.data.role === 'SPECTATOR' && socket.data.roomId) {
        const spectatorRoomId = socket.data.roomId;
        await socket.leave(publicRoomName(spectatorRoomId));
        socket.data = {};
        acknowledge(successAck({ roomDeleted: false }));
        return;
      }
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const now = new Date();
      let proposalPlayers: string[] = [];
      const committed = await commitRoomCommand(runtime, roomId, async (context) => {
        const { room, state, transaction } = context;
        const member = room.gameSnapshot.members[playerId];
        if (!member || member.membershipStatus === 'LEFT') {
          throw new CommandError('CONFLICT', 'This player has already left the room.');
        }
        await transaction.playerSessions.revokeByPlayer(roomId, playerId, now);

        if (room.status === 'LOBBY') {
          delete room.gameSnapshot.members[playerId];
          delete state.players[playerId];
          state.boardState.players = activePlayerIds(room.gameSnapshot);
          dropSeatSwapRequestsOf(state, [playerId]);
          if (room.hostPlayerId === playerId) {
            room.hostPlayerId = activeHumanIds(room.gameSnapshot)[0] ?? null;
          }
          // Bots never keep a room: the last human to leave closes it.
          if (activeHumanIds(room.gameSnapshot).length === 0) context.deleteRoom();
          return [];
        }

        let cancelledOffers: TradeOfferRecord[];
        if (room.status === 'IN_PROGRESS') {
          const proposal = state.privateState.forcedSaleProposal;
          proposalPlayers = proposal
            && (proposal.sellerPlayerId === playerId || proposal.buyerPlayerId === playerId)
            ? [proposal.sellerPlayerId, proposal.buyerPlayerId]
            : [];
          // A bankrupt player who leaves can never be revived: their window (if any) closes with them.
          if (member.membershipStatus === 'FINISHED') closeReviveWindow(state, playerId);
          const result = member.membershipStatus === 'FINISHED'
            ? { changed: true, continuation: null }
            : surrenderPlayerToBank(state, playerId, {
              now: now.getTime(),
              ...paymentTimingOptions(runtime),
            });
          if (!result.changed) throw new CommandError('CONFLICT', 'Không thể rời ván lúc này.');
          if (result.continuation) {
            resumePaymentContinuation(state, result.continuation, {
              now: now.getTime(),
              ...paymentTimingOptions(runtime),
            });
          }
          member.membershipStatus = 'LEFT';
          member.ready = false;
          const pendingOffers = await transaction.tradeOffers.listPendingForPlayer(roomId, playerId);
          const cancelled = await Promise.all(
            pendingOffers.map((offer) => transaction.tradeOffers.resolve(
              offer.id,
              'CANCELLED',
              now,
            )),
          );
          cancelledOffers = cancelled.filter((offer) => offer !== null);
        } else {
          // FINISHED: the game is over, so the winner's leave liquidates nothing. The winner stays in the game state exactly as
          // the game ended (cash, properties, turn slot) and only the membership changes, which keeps the victory screen of
          // everyone still in the room intact; the snapshot validator allows this one LEFT-but-live seat.
          if (member.membershipStatus === 'ACTIVE' && state.boardState.winner?.playerId !== playerId) {
            removePlayerFromGame(state, playerId, 'LEFT');
          }
          const pendingOffers = await transaction.tradeOffers.listPendingForPlayer(roomId, playerId);
          const cancelled = await Promise.all(
            pendingOffers.map((offer) => transaction.tradeOffers.resolve(
              offer.id,
              'CANCELLED',
              now,
            )),
          );
          cancelledOffers = cancelled.filter((offer) => offer !== null);
          member.membershipStatus = 'LEFT';
          member.ready = false;
          if (remainingHumanIds(room.gameSnapshot).length === 0) context.deleteRoom();
        }
        // A running game whose last human left would be bots playing for nobody: the room closes.
        if (room.status === 'IN_PROGRESS' && remainingHumanIds(room.gameSnapshot).length === 0) context.deleteRoom();

        if (room.hostPlayerId === playerId) {
          room.hostPlayerId = successorHost(room, playerId);
        }
        return cancelledOffers;
      }, now, actor);

      const generation = socket.data.connectionGeneration;
      if (generation !== undefined) {
        runtime.connections.deactivate(playerId, socket.id, generation);
      }
      await Promise.all([
        socket.leave(privatePlayerRoomName(playerId)),
        socket.leave(publicRoomName(roomId)),
      ]);
      socket.data = {};

      const result: LeaveRoomResult = { roomDeleted: committed.room === null };
      if (committed.room) {
        for (const affectedPlayerId of new Set(proposalPlayers)) {
          io.to(privatePlayerRoomName(affectedPlayerId)).emit('forced sale proposal', null);
        }
        for (const record of committed.result) {
          const offer = projectPrivateOffer(record, committed.room);
          const offerResult: OfferResult = {
            offerId: offer.offerId,
            status: 'CANCELLED',
            proposerPlayerId: offer.proposerPlayerId,
            recipientPlayerId: offer.recipientPlayerId,
            proposerName: offer.proposerName,
            recipientName: offer.recipientName,
            offered: offer.offered,
            requested: offer.requested,
            resolvedAt: offer.resolvedAt ?? now.toISOString(),
          };
          io.to(privatePlayerRoomName(offer.proposerPlayerId)).emit('offer cancelled', offerResult);
          io.to(privatePlayerRoomName(offer.recipientPlayerId)).emit('offer cancelled', offerResult);
        }
        broadcastRoom(io, runtime, committed.room);
      }
      acknowledge(successAck(result, committed.room?.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
