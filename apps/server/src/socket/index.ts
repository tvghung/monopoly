import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import type { AppRuntime } from '../services/runtime';
import { registerAuctionHandlers } from './auction';
import { registerBuildingHandlers } from './building';
import { registerChatHandlers } from './chat';
import { registerJailHandlers } from './jail';
import { registerLobbyHandlers } from './lobby';
import { registerSessionHandlers } from './session';
import { registerTradingHandlers } from './trading';
import { registerTurnHandlers } from './turn';
import { installInboundValidation } from './validation';
import type { AppServer } from './types';

export function registerSocketHandlers(io: AppServer, runtime: AppRuntime): void {
  io.use((socket, next) => {
    if (socket.handshake.auth.protocolVersion !== SOCKET_PROTOCOL_VERSION) {
      const message = 'Client protocol version is no longer supported.';
      const error = new Error(message);
      Object.assign(error, {
        data: { code: 'UPGRADE_REQUIRED', message, retryable: false },
      });
      next(error);
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    installInboundValidation(socket);
    registerSessionHandlers(io, socket, runtime);
    registerLobbyHandlers(io, socket, runtime);
    registerTurnHandlers(io, socket, runtime);
    registerChatHandlers(io, socket, runtime);
    registerTradingHandlers(io, socket, runtime);
    registerBuildingHandlers(io, socket, runtime);
    registerJailHandlers(io, socket, runtime);
    registerAuctionHandlers(io, socket, runtime);
  });
}
