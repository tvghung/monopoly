import { sanitizeName, sendToLog } from '../game';
import {
  getOrCreateRoom,
  getRoom,
  deleteRoom,
  normalizeRoomId,
} from '../rooms';
import type { AppServer, AppSocket } from './types';
import { endAuction } from './auction';

export function registerPlayerHandlers(io: AppServer, socket: AppSocket): void {
  // A player joins a room. This is the only handler that runs before the socket
  // has a room; every other handler resolves the room from `socket.data.roomId`.
  socket.on('new player', (rawName, rawRoomId) => {
    const { id } = socket;
    const roomId = normalizeRoomId(rawRoomId);
    socket.join(roomId);
    socket.data.roomId = roomId;
    const room = getOrCreateRoom(roomId);
    const { state } = room;

    // Ignore duplicate registrations from the same socket (e.g. a resend).
    if (state.players[id]) {
      io.to(roomId).emit('update', state);
      return;
    }

    const newName = sanitizeName(rawName) || 'Player';
    if (!state.boardState.gameStarted) {
      state.players[id] = {
        name: newName,
        currentTile: 0,
        color: room.colors.pop() ?? 'grey',
        accountBalance: 1500,
        isJail: false,
        jailRounds: 0,
        getOutOfJailCards: 0,
      };
      sendToLog(state, `${newName} joined the game as ${state.players[id].color}`);
      state.boardState.players = Object.keys(state.players);
    } else {
      sendToLog(state, `${newName}, game has already started, you are not able to join!`);
    }
    io.to(roomId).emit('update', state);
  });

  // A player disconnects.
  socket.on('disconnect', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (state.players[socket.id]) {
      const playerName = state.players[socket.id].name;
      room.colors.push(state.players[socket.id].color);
      sendToLog(state, `${playerName} left the game.`);
      delete state.players[socket.id];
      for (let i = 0; i < 40; i++) {
        if (state.boardState.ownedProps[i] && state.boardState.ownedProps[i].id === socket.id) {
          delete state.boardState.ownedProps[i];
        }
        if (state.boardState.openMarket[i] && state.boardState.openMarket[i].seller === socket.id) {
          delete state.boardState.openMarket[i];
        }
      }
    }
    if (state.boardState.finishedPlayers[socket.id]) {
      room.colors.push(state.boardState.finishedPlayers[socket.id].color);
      delete state.boardState.finishedPlayers[socket.id];
    }
    state.boardState.players = Object.keys(state.players);

    // Drop the room entirely once no players remain.
    if (state.boardState.players.length === 0) {
      if (room.auctionTimer) clearInterval(room.auctionTimer);
      deleteRoom(room.id);
      return;
    }

    // Remove the departed player from any running auction; end it if it collapses.
    const { auction } = state.boardState;
    if (auction) {
      auction.active = auction.active.filter((activeId) => activeId !== socket.id);
      auction.passed = auction.passed.filter((passedId) => passedId !== socket.id);
      if (auction.highestBidder === socket.id) {
        // The leader left: drop their bid and re-open the floor.
        auction.highestBidder = null;
        auction.highestBidderName = null;
        auction.highestBid = 0;
        auction.passed = [];
      }
      const stillToAct = auction.active.filter(
        (id) => id !== auction.highestBidder && !auction.passed.includes(id),
      );
      if (auction.active.length <= 1 || stillToAct.length === 0) {
        endAuction(io, room);
        return;
      }
    }
    io.to(room.id).emit('update', state);
  });
}
