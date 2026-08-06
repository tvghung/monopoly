import {
  buildHouse,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
} from '../game';
import { getRoom } from '../rooms';
import type { AppServer, AppSocket } from './types';

export function registerBuildingHandlers(io: AppServer, socket: AppSocket): void {
  // Build a house/hotel on a monopolised property (owner only).
  socket.on('build house', (tileID) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (state.boardState.winner) return;
    buildHouse(state, socket.id, tileID);
    io.to(room.id).emit('update', state);
  });

  // Sell a house/hotel back to the bank (owner only).
  socket.on('sell house', (tileID) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (state.boardState.winner) return;
    sellHouse(state, socket.id, tileID);
    io.to(room.id).emit('update', state);
  });

  // Mortgage a property for half its price (owner only).
  socket.on('mortgage property', (tileID) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (state.boardState.winner) return;
    mortgageProperty(state, socket.id, tileID);
    io.to(room.id).emit('update', state);
  });

  // Lift a mortgage (owner only).
  socket.on('unmortgage property', (tileID) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (state.boardState.winner) return;
    unmortgageProperty(state, socket.id, tileID);
    io.to(room.id).emit('update', state);
  });
}
