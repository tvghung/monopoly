import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import type { ServerRuntimeProfile } from '../config';
import type { AppRuntime } from '../services/runtime';
import { registerBuildingHandlers } from './building';
import { registerCardHandlers } from './card';
import { registerChatHandlers } from './chat';
import { registerDebtHandlers } from './debt';
import { registerJailHandlers } from './jail';
import { registerLobbyHandlers } from './lobby';
import { registerSessionHandlers } from './session';
import { registerTradingHandlers } from './trading';
import { registerTurnHandlers } from './turn';
import { installInboundValidation } from './validation';
import type { AppServer } from './types';

export function canCreateRoomForPeer(
  runtimeProfile: ServerRuntimeProfile,
  address: string,
): boolean {
  if (runtimeProfile !== 'desktop') return true;
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return normalized === '::1' || normalized.startsWith('127.');
}

export function registerSocketHandlers(
  io: AppServer,
  runtime: AppRuntime,
  runtimeProfile: ServerRuntimeProfile,
): void {
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
    registerSessionHandlers(
      io,
      socket,
      runtime,
      canCreateRoomForPeer(runtimeProfile, socket.handshake.address),
    );
    registerLobbyHandlers(io, socket, runtime);
    registerTurnHandlers(io, socket, runtime);
    registerChatHandlers(io, socket, runtime);
    registerDebtHandlers(io, socket, runtime);
    registerTradingHandlers(io, socket, runtime);
    registerBuildingHandlers(io, socket, runtime);
    registerCardHandlers(io, socket, runtime);
    registerJailHandlers(io, socket, runtime);
  });
}
