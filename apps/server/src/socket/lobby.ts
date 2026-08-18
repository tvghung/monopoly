import {
  setReadyRequestSchema,
  type LeaveRoomResult,
  type OfferResult,
} from '@monopoly/shared';
import {
  chooseStartingPlayer,
  createShuffledDecks,
  removePlayerFromGame,
  resumePaymentContinuation,
  rotateSeatOrder,
  sendToLog,
  surrenderPlayerToBank,
} from '../game';
import { activePlayerIds, MAX_PLAYERS, MIN_PLAYERS } from '../rooms';
import type { AppRuntime } from '../services/runtime';
import type { TradeOfferRecord } from '../persistence';
import { projectPrivateOffer } from '../services/privateOffers';
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

export function registerLobbyHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('set ready', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(setReadyRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room }) => {
        if (room.status !== 'LOBBY') {
          throw new CommandError('CONFLICT', 'Ready state can only change in the lobby.');
        }
        const member = room.gameSnapshot.members[playerId];
        if (!member || member.membershipStatus !== 'ACTIVE') {
          throw new CommandError('FORBIDDEN', 'Only an active player can become ready.');
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
        if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
          throw new CommandError(
            'CONFLICT',
            `A game requires between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`,
          );
        }
        if (players.some((id) => !room.gameSnapshot.members[id]?.ready)) {
          throw new CommandError('CONFLICT', 'Every active player must be ready.');
        }
        if (players.some((id) => !runtime.connections.isConnected(id))) {
          throw new CommandError('CONFLICT', 'Every active player must be connected.');
        }

        room.status = 'IN_PROGRESS';
        state.boardState.gameStarted = true;
        state.boardState.gameStartedAt = state.boardState.gameStartedAt ?? now.toISOString();
        const startingRoll = chooseStartingPlayer(players);
        state.boardState.players = rotateSeatOrder(players, startingRoll.winner);
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
        if (room.status === 'FINISHED') {
          throw new CommandError('CONFLICT', 'Ván đã kết thúc; không thể rời phòng lưu trữ.');
        }
        await transaction.playerSessions.revokeByPlayer(roomId, playerId, now);

        if (room.status === 'LOBBY') {
          delete room.gameSnapshot.members[playerId];
          delete state.players[playerId];
          state.boardState.players = activePlayerIds(room.gameSnapshot);
          if (room.hostPlayerId === playerId) {
            room.hostPlayerId = state.boardState.players[0] ?? null;
          }
          if (state.boardState.players.length === 0) context.deleteRoom();
          return [];
        }

        let cancelledOffers: TradeOfferRecord[];
        if (room.status === 'IN_PROGRESS') {
          const proposal = state.privateState.forcedSaleProposal;
          proposalPlayers = proposal
            && (proposal.sellerPlayerId === playerId || proposal.buyerPlayerId === playerId)
            ? [proposal.sellerPlayerId, proposal.buyerPlayerId]
            : [];
          const result = member.membershipStatus === 'FINISHED'
            ? { changed: true, continuation: null }
            : surrenderPlayerToBank(state, playerId, {
              now: now.getTime(),
              paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
            });
          if (!result.changed) throw new CommandError('CONFLICT', 'Không thể rời ván lúc này.');
          if (result.continuation) {
            resumePaymentContinuation(state, result.continuation, {
              now: now.getTime(),
              paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
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
          if (member.membershipStatus === 'ACTIVE') {
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
          if (Object.values(room.gameSnapshot.members).every(
            (candidate) => candidate.membershipStatus === 'LEFT',
          )) {
            context.deleteRoom();
          }
        }

        if (room.hostPlayerId === playerId) {
          room.hostPlayerId = activePlayerIds(room.gameSnapshot)
            .find((candidate) => candidate !== playerId) ?? null;
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
