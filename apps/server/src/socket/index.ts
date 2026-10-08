import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { timingSafeEqual } from 'node:crypto';
import type { ServerRuntimeProfile } from '../config';
import type { AppRuntime } from '../services/runtime';
import { AdmissionLimiter } from './admissionLimiter';
import { registerBuildingHandlers } from './building';
import { registerCardHandlers } from './card';
import { registerChatHandlers } from './chat';
import { registerDebtHandlers } from './debt';
import { registerJailHandlers } from './jail';
import { registerLobbyHandlers } from './lobby';
import { registerSessionHandlers } from './session';
import { registerTeamHandlers } from './team';
import { registerTradingHandlers } from './trading';
import { registerTurnHandlers } from './turn';
import { installInboundValidation } from './validation';
import type { AppServer } from './types';

export interface HostRoomAuthorization {
  roomCode: string;
  secret: string;
}

export function canCreateRoom(
  profile: ServerRuntimeProfile,
  authorization: HostRoomAuthorization | undefined,
  roomCode: string,
  capability: string | undefined,
): boolean {
  if (profile !== 'desktop') return true;
  if (!authorization || roomCode !== authorization.roomCode || !capability
    || !/^[a-f0-9]{64}$/.test(capability) || !/^[a-f0-9]{64}$/.test(authorization.secret)) return false;
  return timingSafeEqual(Buffer.from(capability, 'hex'), Buffer.from(authorization.secret, 'hex'));
}

export interface SocketHandlerOptions {
  /** The one room this process may create, with the secret only the desktop Host holds (desktop profile). */
  hostAuthorization?: HostRoomAuthorization;
  /** Read the visitor address from the local tunnel connector (Online Host only; see `tunnelHeaderTrusted`). */
  trustTunnelHeader?: boolean;
}

export function registerSocketHandlers(
  io: AppServer,
  runtime: AppRuntime,
  runtimeProfile: ServerRuntimeProfile,
  { hostAuthorization, trustTunnelHeader = false }: SocketHandlerOptions = {},
): void {
  // One limiter per server: its state is shared by every connection and dies with the process.
  const admissions = new AdmissionLimiter();

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
    registerSessionHandlers(io, socket, runtime, {
      canCreateRoom: (roomCode, capability) => canCreateRoom(
        runtimeProfile,
        hostAuthorization,
        roomCode,
        capability,
      ),
      admissions,
      trustTunnelHeader,
    });
    registerLobbyHandlers(io, socket, runtime);
    registerTeamHandlers(io, socket, runtime);
    registerTurnHandlers(io, socket, runtime);
    registerChatHandlers(io, socket, runtime);
    registerDebtHandlers(io, socket, runtime);
    registerTradingHandlers(io, socket, runtime);
    registerBuildingHandlers(io, socket, runtime);
    registerCardHandlers(io, socket, runtime);
    registerJailHandlers(io, socket, runtime);
  });
}
