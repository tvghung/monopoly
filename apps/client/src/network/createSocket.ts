import { io } from 'socket.io-client';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import type { AppSocket } from '../types';
import type { RuntimeConfig } from '../runtime/types';

export function createSocket(runtimeConfig: RuntimeConfig): AppSocket {
  return io(runtimeConfig.socketUrl || undefined, {
    autoConnect: false,
    auth: { protocolVersion: SOCKET_PROTOCOL_VERSION },
  });
}

