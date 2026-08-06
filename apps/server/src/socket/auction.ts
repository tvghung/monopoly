import {
  checkBalance,
  finalizeAuction,
  startAuction,
  sendToLog,
} from '../game';
import type { Room } from '../rooms';
import { getRoom } from '../rooms';
import type { AppServer, AppSocket } from './types';

// Finalise the current auction, clear its countdown, and broadcast the result.
export const endAuction = (io: AppServer, room: Room): void => {
  if (room.auctionTimer) {
    clearInterval(room.auctionTimer);
    room.auctionTimer = undefined;
  }
  finalizeAuction(room.state);
  checkBalance(room.state, false);
  io.to(room.id).emit('update', room.state);
};

// Start an auction for `tileID` and run a one-second countdown that broadcasts
// each tick and finalises the sale when it reaches zero.
export const beginAuction = (io: AppServer, room: Room, tileID: number): void => {
  startAuction(room.state, tileID);
  io.to(room.id).emit('update', room.state);
  room.auctionTimer = setInterval(() => {
    const { auction } = room.state.boardState;
    if (!auction) {
      if (room.auctionTimer) clearInterval(room.auctionTimer);
      room.auctionTimer = undefined;
      return;
    }
    auction.timer -= 1;
    if (auction.timer <= 0) {
      endAuction(io, room);
      return;
    }
    io.to(room.id).emit('update', room.state);
  }, 1000);
};

export function registerAuctionHandlers(io: AppServer, socket: AppSocket): void {
  // The current player declined to buy the tile they landed on — auction it.
  socket.on('decline property', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const player = state.players[socket.id];
    if (!player) return;
    if (state.boardState.currentPlayer.id !== socket.id) return;
    if (!state.turnInfo.canBuyProp) return;
    if (state.boardState.auction) return;
    beginAuction(io, room, player.currentTile);
  });

  // Place a bid in the running auction (any active, solvent player).
  socket.on('place bid', (amount) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const { auction } = state.boardState;
    const player = state.players[socket.id];
    if (!auction || !player) return;
    if (!auction.active.includes(socket.id)) return;
    if (!Number.isFinite(amount)) return;
    // Normalise to a whole number first, then validate — otherwise a fractional
    // bid like `highestBid + 0.5` passes the check but floors back down to a
    // non-increasing bid once stored.
    const bid = Math.floor(amount);
    if (bid <= auction.highestBid) return;
    if (bid > player.accountBalance) return;
    auction.highestBid = bid;
    auction.highestBidder = socket.id;
    auction.highestBidderName = player.name;
    // A fresh bid re-opens the floor: everyone who had declined can react again.
    auction.passed = [];
    // Keep the auction open a little longer after a fresh bid.
    if (auction.timer < 15) auction.timer = 15;
    sendToLog(state, `${player.name} bid $${auction.highestBid}M for ${auction.tileName}.`);
    io.to(room.id).emit('update', state);
  });

  // Decline to bid (for now). The auction only ends when everyone except the
  // current top bidder has declined since the last bid — a new bid clears these,
  // so declining never locks you out of reacting to a later lowball bid.
  socket.on('pass bid', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const { auction } = state.boardState;
    const player = state.players[socket.id];
    if (!auction || !player) return;
    if (!auction.active.includes(socket.id)) return;
    // The current top bidder can't decline their own leading bid.
    if (auction.highestBidder === socket.id) return;
    if (!auction.passed.includes(socket.id)) auction.passed.push(socket.id);
    sendToLog(state, `${player.name} declined to bid on ${auction.tileName}.`);
    // Everyone who could still act (everyone but the top bidder) has declined.
    const stillToAct = auction.active.filter(
      (id) => id !== auction.highestBidder && !auction.passed.includes(id),
    );
    if (stillToAct.length === 0) {
      endAuction(io, room);
      return;
    }
    io.to(room.id).emit('update', state);
  });
}
