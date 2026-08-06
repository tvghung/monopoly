import { tileState } from '@monopoly/shared';
import {
  sendToLog,
  nextTurn,
  rollDice,
  movePlayer,
  resolveTile,
  handleJailRoll,
} from '../game';
import { getRoom } from '../rooms';
import type { AppServer, AppSocket } from './types';

export function registerTurnHandlers(io: AppServer, socket: AppSocket): void {
  // Start the game.
  socket.on('start game', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    state.boardState.gameStarted = true;
    sendToLog(state, 'The Game has started!!! Good luck players!');
    nextTurn(state);
    io.to(room.id).emit('update', state);
  });

  // Roll the dice (server-authoritative). The server generates the dice, moves
  // the player, and resolves the landed tile — the client only asks to roll.
  socket.on('roll dice', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const { id } = socket;
    const player = state.players[id];
    // Authority guards: game running, sender's turn, and not already rolled.
    if (!player) return;
    if (!state.boardState.gameStarted) return;
    if (state.boardState.currentPlayer.id !== id) return;
    if (state.boardState.currentPlayer.hasMoved) return;

    const dice = rollDice();
    const diceResult = dice.dice1 + dice.dice2;

    if (player.isJail) {
      handleJailRoll(state, id, dice);
      io.to(room.id).emit('update', state);
      return;
    }

    state.boardState.diceValue = dice;
    state.boardState.currentPlayer.hasMoved = true;
    sendToLog(state, `${player.name} rolled ${diceResult}!`);
    movePlayer(state, id, diceResult);
    resolveTile(state, id, diceResult);
    io.to(room.id).emit('update', state);
  });

  // Buy the property the player is standing on. Only the current player may buy,
  // only on a tile flagged buyable this turn, and only if they can afford it.
  socket.on('buy property', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const player = state.players[socket.id];
    if (!player) return;
    if (state.boardState.currentPlayer.id !== socket.id) return;
    if (!state.turnInfo.canBuyProp) return;
    const { currentTile, name } = player;
    const price = tileState[currentTile].price ?? 0;
    if (player.accountBalance < price) {
      sendToLog(state, `${name} can't afford ${tileState[currentTile].streetName}.`);
      io.to(room.id).emit('update', state);
      return;
    }
    player.accountBalance -= price;
    state.boardState.ownedProps[currentTile] = {
      id: socket.id,
      color: player.color,
      houses: 0,
      mortgaged: false,
    };
    sendToLog(state, `${name} bought a property!`);
    nextTurn(state);
    io.to(room.id).emit('update', state);
  });
}
