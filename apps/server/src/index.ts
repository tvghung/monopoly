import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import {
  tileState,
  chestCards,
  chanceCards,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type InterServerEvents,
  type SocketData,
} from '@monopoly/shared';
import {
  getOrCreateRoom,
  getRoom,
  deleteRoom,
  normalizeRoomId,
} from './rooms';
import {
  escapeHtml,
  sanitizeName,
  sendToLog,
  checkBalance,
  nextTurn,
  checkOwned,
  applyCard,
} from './game';

const { env } = process;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);

// In production the client is served same-origin, so reflecting the request
// origin (true) works without knowing the deployed URL up front; an explicit
// CORS_ORIGIN always wins. In dev we allow the Vite origin.
const corsOrigin = env.CORS_ORIGIN
  || (env.NODE_ENV === 'production' ? true : 'http://localhost:5173');

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  cors: { origin: corsOrigin },
});

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

if (env.NODE_ENV === 'production') {
  const clientDist = env.CLIENT_DIST
    || path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const railRoadTiles = [5, 15, 25, 35];

io.on('connection', (socket) => {
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
      };
      sendToLog(state, `${newName} joined the game as ${state.players[id].color}`);
      state.boardState.players = Object.keys(state.players);
    } else {
      sendToLog(state, `${newName}, game has already started, you are not able to join!`);
    }
    io.to(roomId).emit('update', state);
  });

  // Every handler below resolves the sender's room from `socket.data.roomId`.

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

  // Move a step when the dice are rolled.
  socket.on('makeMove', (num) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const { id } = socket;
    if (!state.players[id]) return;
    const cTile = state.players[id].currentTile;
    if (cTile + num < 40) {
      state.players[id].currentTile = cTile + num;
    } else {
      const left = 40 - cTile;
      const more = num - left;
      state.players[id].currentTile = more;
      state.players[id].accountBalance += 200;
      sendToLog(state, `${state.players[id].name} has passed start and recieved $200M`);
    }
    io.to(room.id).emit('update', state);
  });

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

  // End the current turn.
  socket.on('end turn', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    nextTurn(state);
    state.boardState.currentPlayer.hasMoved = false;
    io.to(room.id).emit('update', state);
  });

  // Resolve the tile a player has moved onto.
  socket.on('player has moved', (hasMoved) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (!state.players[socket.id]) return;
    state.boardState.currentPlayer.hasMoved = hasMoved;
    const { currentTile } = state.players[socket.id];
    const { dice1, dice2 } = state.boardState.diceValue;
    const diceResult = dice1[1] + dice2[1];
    const playerName = state.players[socket.id].name;
    const tile = tileState[currentTile];
    const rent = tile.rent ?? 0;

    switch (tile.tileType) {
      case 'normal':
        checkOwned(state, socket.id, currentTile, () => {
          const currentTileOwner = state.boardState.ownedProps[currentTile].id;
          state.players[socket.id].accountBalance -= rent;
          state.players[currentTileOwner].accountBalance += rent;
          sendToLog(
            state,
            `${playerName} have paid rent $${rent}M to ${
              state.players[currentTileOwner].name
            }`,
          );
        });
        break;
      case 'expense':
        state.players[socket.id].accountBalance -= rent;
        sendToLog(state, `${playerName} paid ${rent} in taxes.`);
        nextTurn(state);
        break;
      case 'railroad': {
        checkOwned(state, socket.id, currentTile, () => {
          const ownerId = state.boardState.ownedProps[currentTile].id;
          let ownedRailroads = 0;
          railRoadTiles.forEach((tileNumb) => {
            if (
              state.boardState.ownedProps[tileNumb]
              && state.boardState.ownedProps[tileNumb].id === ownerId
            ) {
              ownedRailroads += 1;
            }
          });
          const priceToPay = 25 * 2 ** (ownedRailroads - 1);
          state.players[socket.id].accountBalance -= priceToPay;
          state.players[ownerId].accountBalance += priceToPay;
          if (ownedRailroads > 1) {
            sendToLog(
              state,
              `${playerName} have paid rent $${priceToPay}M for ${ownedRailroads} owned railroads to ${
                state.players[ownerId].name
              }`,
            );
          } else {
            sendToLog(state, `${playerName} have paid rent $${priceToPay}M to ${state.players[ownerId].name}`);
          }
        });
        break;
      }
      case 'gojail':
        state.players[socket.id].isJail = true;
        state.players[socket.id].jailRounds = 0;
        state.players[socket.id].currentTile = 10;
        sendToLog(state, `${playerName} was sent to jail for tax fraud.`);
        nextTurn(state);
        break;
      case 'jail':
        sendToLog(state, `${playerName}, dont't worry! You're just visiting.`);
        nextTurn(state);
        break;
      case 'company': {
        checkOwned(state, socket.id, currentTile, () => {
          const ownerId = state.boardState.ownedProps[currentTile].id;
          let priceToPay = 0;
          if (
            state.boardState.ownedProps[12]
            && state.boardState.ownedProps[28]
            && state.boardState.ownedProps[12].id === ownerId
            && state.boardState.ownedProps[28].id === ownerId
          ) {
            priceToPay = diceResult * 10;
          } else {
            priceToPay = diceResult * 4;
          }
          state.players[socket.id].accountBalance -= priceToPay;
          state.players[ownerId].accountBalance += priceToPay;
          sendToLog(state, `${playerName} have paid rent $${priceToPay}M to ${state.players[ownerId].name}`);
        });
        break;
      }
      case 'chance':
      case 'chest': {
        const deck = tile.tileType === 'chance' ? chanceCards : chestCards;
        const card = deck[Math.floor(Math.random() * deck.length)];
        applyCard(state, socket.id, card);
        nextTurn(state);
        break;
      }
      default:
        nextTurn(state);
        break;
    }
    io.to(room.id).emit('update', state);
  });

  // Buy the property the player is standing on.
  socket.on('buy property', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (!state.players[socket.id]) return;
    const { accountBalance, currentTile, name } = state.players[socket.id];
    const price = tileState[currentTile].price ?? 0;
    state.players[socket.id].accountBalance = accountBalance - price;
    state.boardState.ownedProps[currentTile] = {
      id: socket.id,
      color: state.players[socket.id].color,
    };
    sendToLog(state, `${name} bought a property!`);
    nextTurn(state);
    io.to(room.id).emit('update', state);
  });

  // Update the shared dice state.
  socket.on('send dice', (dices) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (!state.players[socket.id]) return;
    state.boardState.diceValue = dices;
    const diceResult = dices.dice1[1] + dices.dice2[1];
    const playerName = state.players[socket.id].name;
    sendToLog(state, `${playerName} rolled ${diceResult}!`);
    io.to(room.id).emit('update', state);
  });

  // Handle a roll while in jail.
  socket.on('in jail', (dices) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (!state.players[socket.id]) return;
    const { jailRounds, currentTile, name } = state.players[socket.id];
    const diceResult = dices.dice1[1] + dices.dice2[1];
    if (jailRounds === 2) {
      state.players[socket.id].currentTile = currentTile + diceResult;
      state.players[socket.id].isJail = false;
      state.players[socket.id].jailRounds = 0;
      state.boardState.currentPlayer.hasMoved = true;
      sendToLog(state, `${name} waited patiently and got out of jail.`);
    } else if (dices.dice1[1] === dices.dice2[1]) {
      state.players[socket.id].currentTile = currentTile + diceResult;
      state.players[socket.id].isJail = false;
      state.players[socket.id].jailRounds = 0;
      sendToLog(state, `${name} got lucky and escaped jail!`);
    } else {
      state.players[socket.id].jailRounds += 1;
      sendToLog(state, `${name} has to stay in jail.`);
    }
    state.boardState.diceValue = dices;
    nextTurn(state);
    io.to(room.id).emit('update', state);
  });

  // List a property on the open market.
  socket.on('put on open market', (saleInfo) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const { tileID, playerId, price } = saleInfo;
    const tileName = tileState[tileID].streetName;
    const sellerName = state.players[playerId]?.name;
    if (!sellerName) return;
    state.boardState.openMarket[tileID] = {
      seller: playerId,
      price,
      sellerName,
      tileName,
    };
    io.to(room.id).emit('update', state);
  });

  // Remove a property listing.
  socket.on('remove sale', (item) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const tile = Number(item);
    if (!state.boardState.openMarket[tile]) return;
    const { tileName } = state.boardState.openMarket[tile];
    delete state.boardState.openMarket[tile];
    const playerName = state.players[socket.id]?.name ?? 'A player';
    sendToLog(state, `${playerName} removed ${tileName} from the open market.`);
    io.to(room.id).emit('update', state);
  });

  // Buy a property from the open market.
  socket.on('make sale', (item) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const tile = Number(item);
    if (!state.boardState.openMarket[tile] || !state.players[socket.id]) return;
    const {
      seller, price, sellerName, tileName,
    } = state.boardState.openMarket[tile];
    const buyerName = state.players[socket.id].name;
    if (state.players[seller]) state.players[seller].accountBalance += price;
    state.players[socket.id].accountBalance -= price;
    state.boardState.ownedProps[tile].id = socket.id;
    state.boardState.ownedProps[tile].color = state.players[socket.id].color;
    delete state.boardState.openMarket[tile];
    sendToLog(state, `${buyerName} has bought ${tileName} from ${sellerName}`);
    checkBalance(state, true);
    io.to(room.id).emit('update', state);
  });

  // Make a private offer to a property owner.
  socket.on('make offer', (item) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const { playerId, tileID } = item;
    const buyerName = state.players[playerId]?.name;
    const tileOwner = state.boardState.ownedProps[tileID]?.id;
    if (!buyerName || !tileOwner) return;
    const tileName = tileState[tileID].streetName;
    io.to(tileOwner).emit('offer on prop', { ...item, buyerName, tileName });
  });

  // Owner declines a private offer.
  socket.on('decline offer', (offer) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const {
      playerId, tileID, price, tileName,
    } = offer;
    const ownerID = state.boardState.ownedProps[tileID]?.id;
    if (!ownerID) return;
    const ownerName = state.players[ownerID].name;
    io.to(playerId).emit('offer declined', { tileName, price, ownerName });
  });

  // Owner accepts a private offer.
  socket.on('accept offer', (offer) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const {
      playerId, tileID, price, tileName,
    } = offer;
    const ownerID = state.boardState.ownedProps[tileID]?.id;
    if (!ownerID || !state.players[playerId]) return;
    const ownerName = state.players[ownerID].name;
    const buyerName = state.players[playerId].name;
    state.players[ownerID].accountBalance += price;
    state.players[playerId].accountBalance -= price;
    state.boardState.ownedProps[tileID].id = playerId;
    state.boardState.ownedProps[tileID].color = state.players[playerId].color;
    sendToLog(state, `${buyerName} privately bought ${tileName} from ${ownerName} for $${price}M`);
    io.to(playerId).emit('offer accepted', { tileName, price, ownerName });

    if (state.boardState.openMarket[tileID]) delete state.boardState.openMarket[tileID];
    checkBalance(state, true);
    io.to(room.id).emit('update', state);
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
      deleteRoom(room.id);
      return;
    }
    io.to(room.id).emit('update', state);
  });
});

const PORT = env.PORT || 8080;

server.listen(PORT, () => console.log(`Server is running on ${PORT}`));
