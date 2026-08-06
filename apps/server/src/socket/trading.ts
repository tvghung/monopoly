import { tileState } from '@monopoly/shared';
import { checkBalance, sendToLog } from '../game';
import { getRoom } from '../rooms';
import type { AppServer, AppSocket } from './types';

export function registerTradingHandlers(io: AppServer, socket: AppSocket): void {
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
}
