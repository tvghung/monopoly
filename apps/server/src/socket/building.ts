import { sellHouseRequestSchema, type AckCallback, type GameState } from '@monopoly/shared';
import type { TradeOfferRecord } from '../persistence/types';
import {
  isPropertyLockedByLandingDecision,
  sellHouse,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { cancelPendingOffersForAssets, emitCancelledOffers } from '../services/offerInvalidation';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

type PropertyAction = (state: GameState, playerId: string, tileID: number) => boolean;

async function executePropertyAction(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
  rawRequest: unknown,
  acknowledge: AckCallback,
  action: PropertyAction,
): Promise<void> {
  try {
    const { tileID, requestId } = parsePayload(sellHouseRequestSchema, rawRequest);
    const actor = requirePlayer(socket, runtime);
    const now = new Date();
    let replayed = false;
    const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }): Promise<TradeOfferRecord[]> => {
      // A retransmitted emit of a sale that already committed: acknowledge it again, sell nothing.
      replayed = runtime.sellHouseRequests.find(actor.roomId, actor.playerId, 'sell house', requestId) !== undefined;
      if (replayed) return [];
      if (room.status !== 'IN_PROGRESS' || state.boardState.winner || state.boardState.paymentQueue) {
        throw new CommandError('CONFLICT', 'Hành động tài sản bị khóa trong lúc thanh toán thiếu hụt.');
      }
      if (isPropertyLockedByLandingDecision(state, tileID)) {
        throw new CommandError('CONFLICT', 'Tài sản đang chờ quyết định phát triển của lượt hiện tại.');
      }
      if (!action(state, actor.playerId, tileID)) {
        throw new CommandError('CONFLICT', 'Hành động tài sản không hợp lệ.');
      }
      return cancelPendingOffersForAssets(transaction.tradeOffers, actor.roomId, null, [tileID], [], now);
    }, now, actor, {
      afterCommit: (done) => {
        if (done.room && !replayed) runtime.sellHouseRequests.record(actor.roomId, actor.playerId, 'sell house', requestId, true);
      },
    });
    if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
    emitCancelledOffers(io, committed.room, committed.result, now);
    broadcastRoom(io, runtime, committed.room);
    acknowledge(successAck(committed.room.aggregateVersion));
  } catch (error) {
    acknowledgeFailure(acknowledge, error);
  }
}

export function registerBuildingHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('sell house', (request, acknowledge) => {
    void executePropertyAction(io, socket, runtime, request, acknowledge, sellHouse);
  });
}
