import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import {
  tileState,
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
  rollDice,
  movePlayer,
  resolveTile,
  handleJailRoll,
  buildHouse,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
  startAuction,
  finalizeAuction,
} from './game';
import type { Room } from './rooms';

const { env } = process;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);

// In production the client is served same-origin, so cross-origin requests are
// disallowed by default (rather than reflecting any Origin); set CORS_ORIGIN to
// explicitly allow another origin. In dev we allow the Vite origin.
const corsOrigin = env.CORS_ORIGIN
  || (env.NODE_ENV === 'production' ? false : 'http://localhost:5173');

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

// Finalise the current auction, clear its countdown, and broadcast the result.
const endAuction = (room: Room): void => {
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
const beginAuction = (room: Room, tileID: number): void => {
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
      endAuction(room);
      return;
    }
    io.to(room.id).emit('update', room.state);
  }, 1000);
};

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
        getOutOfJailCards: 0,
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
    const diceResult = dice.dice1[1] + dice.dice2[1];

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

  // End the current turn (only the current player may).
  socket.on('end turn', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    if (state.boardState.currentPlayer.id !== socket.id) return;
    nextTurn(state);
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

  // List a property on the open market.
  socket.on('put on open market', (saleInfo) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const { tileID, price } = saleInfo;
    const tileName = tileState[tileID].streetName;
    const sellerName = state.players[socket.id]?.name;
    // Only the tile's owner may list it, and the price must be positive.
    const owner = state.boardState.ownedProps[tileID];
    if (!sellerName || !owner || owner.id !== socket.id) return;
    if (!(price > 0)) return;
    state.boardState.openMarket[tileID] = {
      seller: socket.id,
      price,
      sellerName,
      tileName,
    };
    io.to(room.id).emit('update', state);
  });

  // Remove a property listing (only the seller may).
  socket.on('remove sale', (item) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const { state } = room;
    const tile = Number(item);
    if (!state.boardState.openMarket[tile]) return;
    if (state.boardState.openMarket[tile].seller !== socket.id) return;
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
    // Can't buy your own listing, and you must be able to afford it.
    if (seller === socket.id) return;
    if (state.players[socket.id].accountBalance < price) {
      sendToLog(state, `${state.players[socket.id].name} can't afford ${tileName}.`);
      io.to(room.id).emit('update', state);
      return;
    }
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
    const { tileID } = item;
    // The buyer is always the socket making the offer — never trust a
    // client-supplied playerId, which could be spoofed to impersonate someone.
    const buyerId = socket.id;
    const buyerName = state.players[buyerId]?.name;
    const tileOwner = state.boardState.ownedProps[tileID]?.id;
    if (!buyerName || !tileOwner) return;
    const tileName = tileState[tileID].streetName;
    io.to(tileOwner).emit('offer on prop', {
      ...item, playerId: buyerId, buyerName, tileName,
    });
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
    // Only the property's owner may decline an offer for it.
    if (!ownerID || ownerID !== socket.id) return;
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
    // Only the property's owner may accept, and the buyer must still exist.
    if (!ownerID || ownerID !== socket.id || !state.players[playerId]) return;
    const ownerName = state.players[ownerID].name;
    const buyerName = state.players[playerId].name;
    // The buyer must still be able to afford the agreed price.
    if (state.players[playerId].accountBalance < price) {
      sendToLog(state, `${buyerName} can no longer afford ${tileName}.`);
      io.to(room.id).emit('update', state);
      return;
    }
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
    beginAuction(room, player.currentTile);
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
      endAuction(room);
      return;
    }
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
        endAuction(room);
        return;
      }
    }
    io.to(room.id).emit('update', state);
  });
});

const PORT = env.PORT || 8080;

server.listen(PORT, () => console.log(`Server is running on ${PORT}`));
