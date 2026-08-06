import { sendToLog } from '../game';
import { getRoom } from '../rooms';
import type { AppServer, AppSocket } from './types';

export function registerJailHandlers(io: AppServer, socket: AppSocket): void {
  // Pay $50 bail to leave jail (current player, on their turn, while jailed).
  socket.on('pay bail', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const player = state.players[socket.id];
    if (!player || !player.isJail) return;
    if (state.boardState.currentPlayer.id !== socket.id) return;
    if (player.accountBalance < 50) {
      sendToLog(state, `${player.name} can't afford the $50M bail.`);
      io.to(room.id).emit('update', state);
      return;
    }
    player.accountBalance -= 50;
    player.isJail = false;
    player.jailRounds = 0;
    sendToLog(state, `${player.name} paid $50M bail and is free to move.`);
    io.to(room.id).emit('update', state);
  });

  // Use a Get Out Of Jail Free card (current player, on their turn, while jailed).
  socket.on('use jail card', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const player = state.players[socket.id];
    if (!player || !player.isJail) return;
    if (state.boardState.currentPlayer.id !== socket.id) return;
    if (player.getOutOfJailCards < 1) return;
    player.getOutOfJailCards -= 1;
    player.isJail = false;
    player.jailRounds = 0;
    sendToLog(state, `${player.name} used a Get Out Of Jail Free card.`);
    io.to(room.id).emit('update', state);
  });
}
