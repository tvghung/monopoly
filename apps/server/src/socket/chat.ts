import { escapeHtml, sendToLog } from '../game';
import { getRoom } from '../rooms';
import type { AppServer, AppSocket } from './types';

export function registerChatHandlers(io: AppServer, socket: AppSocket): void {
  // Chat message.
  socket.on('send chat', (message) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const safeMessage = escapeHtml(message);
    if (state.boardState.players.includes(socket.id)) {
      sendToLog(
        state,
        `<span style="color:${state.players[socket.id].color}" class="log-chat-name" >${
          state.players[socket.id].name
        }</span> says: ${safeMessage}`,
      );
    } else if (state.boardState.finishedPlayers[socket.id]) {
      sendToLog(
        state,
        `<span style="color:${state.boardState.finishedPlayers[socket.id].color}" class="log-chat-name" >${
          state.boardState.finishedPlayers[socket.id].name
        }</span> says: ${safeMessage}`,
      );
    } else {
      sendToLog(state, `<span style="color:grey" class="log-chat-name">Spectator</span> says: ${safeMessage}`);
    }
    io.to(room.id).emit('update', state);
  });
}
