import type { AppServer } from './types';
import { registerPlayerHandlers } from './player';
import { registerTurnHandlers } from './turn';
import { registerChatHandlers } from './chat';
import { registerTradingHandlers } from './trading';
import { registerBuildingHandlers } from './building';
import { registerJailHandlers } from './jail';
import { registerAuctionHandlers } from './auction';

// Wire every per-connection handler group. Each `register*` attaches its own
// `socket.on(...)` listeners; grouping them by domain keeps this file a simple
// table of contents for the socket layer.
export function registerSocketHandlers(io: AppServer): void {
  io.on('connection', (socket) => {
    registerPlayerHandlers(io, socket);
    registerTurnHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerTradingHandlers(io, socket);
    registerBuildingHandlers(io, socket);
    registerJailHandlers(io, socket);
    registerAuctionHandlers(io, socket);
  });
}
