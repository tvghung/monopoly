import { randomUUID } from 'node:crypto';
import {
  offerActionSchema,
  offerInfoSchema,
  saleInfoSchema,
  tileRequestSchema,
  tileState,
  type MakeOfferResult,
  type OfferResult,
} from '@monopoly/shared';
import { checkBalance, sendToLog } from '../game';
import { projectPrivateOffer } from '../services/privateOffers';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom, privatePlayerRoomName } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';
import { parsePayload } from './validation';

const OFFER_TTL_MS = 20_000;

export function registerTradingHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('put on open market', async (rawSale, acknowledge) => {
    try {
      const sale = parsePayload(saleInfoSchema, rawSale);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const player = state.players[playerId];
        const owner = state.boardState.ownedProps[sale.tileID];
        const tile = tileState[sale.tileID];
        if (room.status !== 'IN_PROGRESS' || !player || !owner || owner.id !== playerId || !tile) {
          throw new CommandError('FORBIDDEN', 'Only the current owner can list this property.');
        }
        state.boardState.openMarket[sale.tileID] = {
          seller: playerId,
          price: sale.price,
          sellerName: player.name,
          tileName: tile.streetName,
        };
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('remove sale', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(tileRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ state }) => {
        const listing = state.boardState.openMarket[request.tileID];
        if (!listing || listing.seller !== playerId) {
          throw new CommandError('FORBIDDEN', 'Only the seller can remove this listing.');
        }
        delete state.boardState.openMarket[request.tileID];
        const playerName = state.players[playerId]?.name ?? 'A player';
        sendToLog(state, `${playerName} removed ${listing.tileName} from the open market.`);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('make sale', async (rawRequest, acknowledge) => {
    try {
      const request = parsePayload(tileRequestSchema, rawRequest);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const listing = state.boardState.openMarket[request.tileID];
        const buyer = state.players[playerId];
        if (room.status !== 'IN_PROGRESS' || !listing || !buyer) {
          throw new CommandError('CONFLICT', 'This listing is no longer available.');
        }
        const property = state.boardState.ownedProps[request.tileID];
        const seller = state.players[listing.seller];
        if (!property || property.id !== listing.seller || !seller) {
          throw new CommandError('CONFLICT', 'The listing owner is no longer valid.');
        }
        if (listing.seller === playerId) {
          throw new CommandError('FORBIDDEN', 'You cannot buy your own listing.');
        }
        if (buyer.accountBalance < listing.price) {
          throw new CommandError('CONFLICT', `You can't afford ${listing.tileName}.`);
        }
        seller.accountBalance += listing.price;
        buyer.accountBalance -= listing.price;
        property.id = playerId;
        property.color = buyer.color;
        delete state.boardState.openMarket[request.tileID];
        sendToLog(state, `${buyer.name} has bought ${listing.tileName} from ${listing.sellerName}`);
        checkBalance(state, true);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('make offer', async (rawOffer, acknowledge) => {
    try {
      const request = parsePayload(offerInfoSchema, rawOffer);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const now = new Date();
      const offerId = randomUUID();
      const expiresAt = new Date(now.getTime() + OFFER_TTL_MS);
      const committed = await commitRoomCommand(runtime, roomId, async ({ room, state, transaction }) => {
        const buyer = state.players[playerId];
        const ownerPlayerId = state.boardState.ownedProps[request.tileID]?.id;
        const owner = ownerPlayerId ? state.players[ownerPlayerId] : undefined;
        if (room.status !== 'IN_PROGRESS' || !buyer || !ownerPlayerId || !owner) {
          throw new CommandError('CONFLICT', 'This property cannot receive an offer.');
        }
        if (ownerPlayerId === playerId) {
          throw new CommandError('FORBIDDEN', 'You cannot offer on your own property.');
        }
        return transaction.tradeOffers.create({
          id: offerId,
          roomId,
          buyerPlayerId: playerId,
          ownerPlayerId,
          tileId: request.tileID,
          price: request.price,
          expiresAt,
        });
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      const offer = projectPrivateOffer(committed.result, committed.room);
      io.to(privatePlayerRoomName(offer.ownerPlayerId)).emit('offer on prop', offer);
      broadcastRoom(io, runtime, committed.room);
      const result: MakeOfferResult = { offerId: offer.offerId, expiresAt: offer.expiresAt };
      acknowledge(successAck(result, committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('decline offer', async (rawAction, acknowledge) => {
    try {
      const request = parsePayload(offerActionSchema, rawAction);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const now = new Date();
      const committed = await commitRoomCommand(runtime, roomId, async ({ transaction }) => {
        const offer = await transaction.tradeOffers.findById(request.offerId);
        if (!offer || offer.roomId !== roomId || offer.ownerPlayerId !== playerId) {
          throw new CommandError('FORBIDDEN', 'This offer does not belong to you.');
        }
        if (offer.expiresAt <= now) {
          throw new CommandError('CONFLICT', 'This offer has expired.');
        }
        const resolved = await transaction.tradeOffers.resolve(offer.id, 'DECLINED', now);
        if (!resolved) throw new CommandError('CONFLICT', 'This offer is no longer pending.');
        return resolved;
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      const offer = projectPrivateOffer(committed.result, committed.room);
      const result = offerResult(offer, now);
      io.to(privatePlayerRoomName(offer.buyerPlayerId)).emit('offer declined', result);
      io.to(privatePlayerRoomName(offer.ownerPlayerId)).emit('offer declined', result);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('accept offer', async (rawAction, acknowledge) => {
    try {
      const request = parsePayload(offerActionSchema, rawAction);
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const now = new Date();
      const committed = await commitRoomCommand(runtime, roomId, async ({ room, state, transaction }) => {
        if (room.status !== 'IN_PROGRESS') {
          throw new CommandError('CONFLICT', 'The game is not in progress.');
        }
        const offer = await transaction.tradeOffers.findById(request.offerId);
        if (!offer || offer.roomId !== roomId || offer.ownerPlayerId !== playerId) {
          throw new CommandError('FORBIDDEN', 'This offer does not belong to you.');
        }
        if (offer.expiresAt <= now) {
          throw new CommandError('CONFLICT', 'This offer has expired.');
        }
        const property = state.boardState.ownedProps[offer.tileId];
        const owner = state.players[playerId];
        const buyer = state.players[offer.buyerPlayerId];
        if (!property || property.id !== playerId || !owner || !buyer) {
          throw new CommandError('CONFLICT', 'Offer participants or ownership changed.');
        }
        if (buyer.accountBalance < offer.price) {
          throw new CommandError('CONFLICT', 'The buyer can no longer afford this offer.');
        }
        const resolved = await transaction.tradeOffers.resolve(offer.id, 'ACCEPTED', now);
        if (!resolved) throw new CommandError('CONFLICT', 'This offer is no longer pending.');

        owner.accountBalance += offer.price;
        buyer.accountBalance -= offer.price;
        property.id = offer.buyerPlayerId;
        property.color = buyer.color;
        delete state.boardState.openMarket[offer.tileId];
        const tileName = tileState[offer.tileId]?.streetName ?? `Tile ${offer.tileId}`;
        sendToLog(
          state,
          `${buyer.name} privately bought ${tileName} from ${owner.name} for $${offer.price}M`,
        );
        checkBalance(state, true);
        return resolved;
      }, now, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      const offer = projectPrivateOffer(committed.result, committed.room);
      const result = offerResult(offer, now);
      io.to(privatePlayerRoomName(offer.buyerPlayerId)).emit('offer accepted', result);
      io.to(privatePlayerRoomName(offer.ownerPlayerId)).emit('offer accepted', result);
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}

function offerResult(
  offer: ReturnType<typeof projectPrivateOffer>,
  now: Date,
): OfferResult {
  if (offer.status === 'PENDING') {
    throw new Error('Cannot emit a result for a pending offer');
  }
  return {
    offerId: offer.offerId,
    status: offer.status,
    tileID: offer.tileID,
    tileName: offer.tileName,
    price: offer.price,
    ownerName: offer.ownerName,
    resolvedAt: offer.resolvedAt ?? now.toISOString(),
  };
}
