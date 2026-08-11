import { tileState } from '@monopoly/shared';
import {
  handleJailRoll,
  movePlayer,
  nextTurn,
  resolveTile,
  rollDice,
  sendToLog,
} from '../game';
import type { AppRuntime } from '../services/runtime';
import { requirePlayer } from './authority';
import { broadcastRoom } from './broadcast';
import { CommandError, acknowledgeFailure, successAck } from './errors';
import { commitRoomCommand } from './roomCommands';
import type { AppServer, AppSocket } from './types';

export function registerTurnHandlers(
  io: AppServer,
  socket: AppSocket,
  runtime: AppRuntime,
): void {
  socket.on('roll dice', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const player = state.players[playerId];
        if (room.status !== 'IN_PROGRESS' || state.boardState.winner) {
          throw new CommandError('CONFLICT', 'The game is not accepting turns.');
        }
        if (!player || state.boardState.currentPlayer.id !== playerId) {
          throw new CommandError('FORBIDDEN', 'It is not your turn.');
        }
        if (state.boardState.currentPlayer.hasMoved || state.boardState.auction) {
          throw new CommandError('CONFLICT', 'This turn cannot roll again.');
        }

        const dice = rollDice();
        const diceResult = dice.dice1 + dice.dice2;
        if (player.isJail) {
          handleJailRoll(state, playerId, dice);
          return;
        }

        state.boardState.diceValue = dice;
        state.boardState.currentPlayer.hasMoved = true;
        sendToLog(state, `${player.name} rolled ${diceResult}!`);
        movePlayer(state, playerId, diceResult);
        resolveTile(state, playerId, diceResult);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });

  socket.on('buy property', async (acknowledge) => {
    try {
      const actor = requirePlayer(socket, runtime);
      const { roomId, playerId } = actor;
      const committed = await commitRoomCommand(runtime, roomId, ({ room, state }) => {
        const player = state.players[playerId];
        if (room.status !== 'IN_PROGRESS' || state.boardState.winner) {
          throw new CommandError('CONFLICT', 'The game is not accepting purchases.');
        }
        if (!player || state.boardState.currentPlayer.id !== playerId) {
          throw new CommandError('FORBIDDEN', 'Only the current player can buy this property.');
        }
        if (!state.turnInfo.canBuyProp || state.boardState.auction) {
          throw new CommandError('CONFLICT', 'There is no property available to buy.');
        }
        const tile = tileState[player.currentTile];
        const price = tile?.price ?? 0;
        if (!tile || price <= 0 || state.boardState.ownedProps[player.currentTile]) {
          throw new CommandError('CONFLICT', 'This property is no longer available.');
        }
        if (player.accountBalance < price) {
          throw new CommandError('CONFLICT', `You can't afford ${tile.streetName}.`);
        }
        player.accountBalance -= price;
        state.boardState.ownedProps[player.currentTile] = {
          id: playerId,
          color: player.color,
          houses: 0,
          mortgaged: false,
        };
        sendToLog(state, `${player.name} bought a property!`);
        nextTurn(state);
      }, undefined, actor);
      if (!committed.room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      broadcastRoom(io, runtime, committed.room);
      acknowledge(successAck(committed.room.aggregateVersion));
    } catch (error) {
      acknowledgeFailure(acknowledge, error);
    }
  });
}
