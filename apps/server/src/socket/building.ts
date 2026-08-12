import { randomUUID } from 'node:crypto';
import { tileIdSchema, type AckCallback, type GameState, type PlayerId } from '@monopoly/shared';
import {
  assertDebtActionAllowed,
  bankBuildingInventory,
  buildHouse,
  canBuildHouse,
  continueDebtAfterLiquidity,
  groupTileIds,
  mortgageProperty,
  requestedBuildingType,
  resumePaymentContinuation,
  sellHouse,
  startNextBankPropertyAuction,
  unmortgageProperty,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import {
  cancelPendingOffersForAssets,
  emitCancelledOffers,
} from '../services/offerInvalidation';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

const invalidateGroupListings = (state: GameState, tileID: number): void => {
  for (const groupTileID of groupTileIds(tileID)) delete state.boardState.openMarket[groupTileID];
};

const requestBuild = (
  state: GameState,
  playerId: PlayerId,
  tileID: number,
  now: Date,
  contentionMs: number,
): void => {
  if (state.turnInfo.pendingPropertyDecision) {
    throw new CommandError('CONFLICT', 'Phải mua hoặc từ chối tài sản đang chờ trước khi xây.');
  }
  if (!assertDebtActionAllowed(state, playerId, 'BUILD')) {
    throw new CommandError('CONFLICT', 'Không thể xây khi một khoản nợ đang chờ xử lý.');
  }
  const buildingType = requestedBuildingType(state, tileID);
  const contention = state.boardState.buildingContention;
  if (contention) {
    if (contention.buildingType !== buildingType) {
      if (!canBuildHouse(state, playerId, tileID, { ignoreInventory: true })) {
        throw new CommandError('CONFLICT', 'Mục tiêu xây không còn hợp lệ.');
      }
      const inventory = bankBuildingInventory(state);
      const available = buildingType === 'HOUSE'
        ? inventory.housesAvailable
        : inventory.hotelsAvailable;
      if (available > 1 && buildHouse(state, playerId, tileID)) {
        invalidateGroupListings(state, tileID);
        return;
      }
      throw new CommandError('CONFLICT', 'Một yêu cầu tranh công trình khác đang diễn ra.');
    }
    if (!canBuildHouse(state, playerId, tileID, { ignoreInventory: true })) {
      throw new CommandError('CONFLICT', 'Mục tiêu xây không còn hợp lệ.');
    }
    contention.requests[playerId] = {
      playerId,
      tileID,
      buildingType,
      requestedAt: now.toISOString(),
    };
    return;
  }
  if (!canBuildHouse(state, playerId, tileID, { ignoreInventory: true })) {
    throw new CommandError('CONFLICT', 'Hiện không thể xây trên tài sản này.');
  }
  const inventory = bankBuildingInventory(state);
  const available = buildingType === 'HOUSE'
    ? inventory.housesAvailable
    : inventory.hotelsAvailable;
  if (available > 1) {
    if (!buildHouse(state, playerId, tileID)) throw new CommandError('CONFLICT', 'Xây công trình thất bại.');
    invalidateGroupListings(state, tileID);
    return;
  }
  if (available === 1) {
    if (state.boardState.auction) {
      throw new CommandError('CONFLICT', 'Đang có phiên đấu giá khác; chưa thể tranh công trình cuối.');
    }
    state.boardState.buildingContention = {
      contentionId: randomUUID(),
      buildingType,
      reservedUnit: { buildingType, quantity: 1 },
      requests: {
        [playerId]: { playerId, tileID, buildingType, requestedAt: now.toISOString() },
      },
      endsAt: new Date(now.getTime() + contentionMs).toISOString(),
    };
    return;
  }
  throw new CommandError('CONFLICT', `Ngân hàng đã hết ${buildingType === 'HOUSE' ? 'Nhà' : 'Khách Sạn'}.`);
};

type PropertyAction = typeof sellHouse;

async function executePropertyAction(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
  rawTileID: unknown,
  acknowledge: AckCallback,
  actionName: 'SELL' | 'MORTGAGE' | 'UNMORTGAGE',
  action: PropertyAction,
): Promise<void> {
  try {
    const tileID = parsePayload(tileIdSchema, rawTileID);
    const actor = requirePlayer(socket, runtime);
    const { roomId, playerId } = actor;
    const now = new Date();
    const committed = await commitRoomCommand(runtime, roomId, async ({ room, state, transaction }) => {
      if (room.status !== 'IN_PROGRESS' || state.boardState.winner) {
        throw new CommandError('CONFLICT', 'Hiện không thể quản lý tài sản.');
      }
      const debtAction = actionName === 'UNMORTGAGE' ? 'UNMORTGAGE' : 'LIQUIDATE';
      if (!assertDebtActionAllowed(state, playerId, debtAction)) {
        throw new CommandError('CONFLICT', 'Hành động này bị khóa trong giai đoạn xử lý nợ.');
      }
      if (!action(state, playerId, tileID)) {
        throw new CommandError('CONFLICT', 'Hành động tài sản không hợp lệ.');
      }
      if (actionName === 'SELL') invalidateGroupListings(state, tileID);
      if (actionName !== 'UNMORTGAGE') {
        const resolutionOptions = {
          now: now.getTime(),
          debtActionTimeoutMs: runtime.timing.debtActionTimeoutMs,
        };
        const continuation = continueDebtAfterLiquidity(state, playerId, resolutionOptions);
        if (continuation && state.boardState.bankPropertyAuctionQueue) {
          state.boardState.bankPropertyAuctionQueue.continuation = continuation;
          startNextBankPropertyAuction(state, { now: now.getTime() });
        } else if (continuation) {
          resumePaymentContinuation(state, continuation, resolutionOptions);
        }
      }
      return cancelPendingOffersForAssets(
        transaction.tradeOffers,
        roomId,
        null,
        groupTileIds(tileID),
        [],
        now,
      );
    }, now, actor);
    if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
    emitCancelledOffers(io, committed.room, committed.result, now);
    broadcastRoom(io, runtime, committed.room);
    acknowledge(successAck(committed.room.aggregateVersion));
  } catch (error) {
    acknowledgeFailure(acknowledge, error);
  }
}

export function registerBuildingHandlers(io: AppServer, socket: AppSocket, runtime: AppRuntime): void {
  socket.on('build house', async (rawTileID, acknowledge) => {
    try {
      const tileID = parsePayload(tileIdSchema, rawTileID);
      const actor = requirePlayer(socket, runtime);
      const now = new Date();
      const committed = await commitRoomCommand(runtime, actor.roomId, async ({ room, state, transaction }) => {
        if (room.status !== 'IN_PROGRESS' || state.boardState.winner) {
          throw new CommandError('CONFLICT', 'Hiện không thể xây công trình.');
        }
        requestBuild(state, actor.playerId, tileID, now, runtime.timing.buildingContentionMs);
        return cancelPendingOffersForAssets(
          transaction.tradeOffers,
          actor.roomId,
          null,
          groupTileIds(tileID),
          [],
          now,
        );
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'Phòng không còn tồn tại.');
      emitCancelledOffers(io, committed.room, committed.result, now);
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
  socket.on('sell house', (tileID, ack) => void executePropertyAction(io, socket, runtime, tileID, ack, 'SELL', sellHouse));
  socket.on('mortgage property', (tileID, ack) => void executePropertyAction(io, socket, runtime, tileID, ack, 'MORTGAGE', mortgageProperty));
  socket.on('unmortgage property', (tileID, ack) => void executePropertyAction(io, socket, runtime, tileID, ack, 'UNMORTGAGE', unmortgageProperty));
}
