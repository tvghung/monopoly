import { SOCKET_PROTOCOL_VERSION, type Ack, type AckCallback, type ClientToServerEvents, type JoinRoomResult, type ResumeSessionResult, type ServerToClientEvents } from '@monopoly/shared';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const CONTRACT_TIMEOUT_MS = 5_000;

export interface Phase71LanContractOptions {
  serverUrl: string;
  roomCode: string;
  timeoutMs?: number;
}

export interface Phase71LanContractResult {
  pass: true;
  roomId: string;
  hostPlayerId: string;
  guestPlayerId: string;
  checks: Record<string, true>;
}

async function connectSocket(url: string, timeoutMs: number): Promise<TestSocket> {
  const socket: TestSocket = createClient(url, {
    auth: { protocolVersion: SOCKET_PROTOCOL_VERSION },
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LAN contract socket connection timed out')), timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', error => {
      clearTimeout(timer);
      reject(new Error(`LAN contract socket connection failed: ${error.message}`));
    });
  }).catch(error => {
    socket.disconnect();
    throw error;
  });
  return socket;
}

function waitForAck<TResult>(
  socket: TestSocket,
  event: 'join room' | 'resume session',
  payload: Parameters<ClientToServerEvents[typeof event]>[0],
  timeoutMs: number,
): Promise<Ack<TResult>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`LAN contract ${event} acknowledgement timed out`)), timeoutMs);
    const acknowledge: AckCallback<TResult> = response => {
      clearTimeout(timer);
      resolve(response);
    };
    if (event === 'join room') {
      socket.emit(event, payload as Parameters<ClientToServerEvents['join room']>[0], acknowledge as AckCallback<JoinRoomResult>);
    } else {
      socket.emit(event, payload as Parameters<ClientToServerEvents['resume session']>[0], acknowledge as AckCallback<ResumeSessionResult>);
    }
  });
}

function successfulData<TResult>(response: Ack<TResult>, label: string): TResult {
  if (!response.ok) throw new Error(`${label} failed: ${response.error.code}`);
  if (response.data === undefined) throw new Error(`${label} returned no data`);
  return response.data;
}

async function joinPlayer(
  socket: TestSocket,
  name: string,
  roomCode: string,
  timeoutMs: number,
): Promise<{ token: string; result: ResumeSessionResult }> {
  const admission = successfulData(
    await waitForAck<JoinRoomResult>(socket, 'join room', { name, roomCode }, timeoutMs),
    'LAN contract admission',
  );
  if (admission.kind !== 'PENDING') throw new Error('LAN contract expected player admission');
  const result = successfulData(
    await waitForAck<ResumeSessionResult>(socket, 'resume session', { token: admission.token }, timeoutMs),
    'LAN contract resume',
  );
  return { token: admission.token, result };
}

export async function runPhase71LanContract(
  options: Phase71LanContractOptions,
): Promise<Phase71LanContractResult> {
  const timeoutMs = options.timeoutMs ?? CONTRACT_TIMEOUT_MS;
  let host: TestSocket | undefined;
  let guest: TestSocket | undefined;
  let reconnectedGuest: TestSocket | undefined;
  try {
    host = await connectSocket(options.serverUrl, timeoutMs);
    const hostSession = await joinPlayer(host, 'LAN Host', options.roomCode, timeoutMs);
    if (hostSession.result.room.roomCode !== options.roomCode.toUpperCase()) {
      throw new Error('LAN contract host room code mismatch');
    }
    if (hostSession.result.room.hostPlayerId !== hostSession.result.playerId) {
      throw new Error('LAN contract did not preserve the first player as room host');
    }

    guest = await connectSocket(options.serverUrl, timeoutMs);
    const guestSession = await joinPlayer(guest, 'LAN Guest', options.roomCode, timeoutMs);
    if (guestSession.result.room.roomId !== hostSession.result.room.roomId) {
      throw new Error('LAN contract clients did not enter the same room');
    }

    guest.disconnect();
    reconnectedGuest = await connectSocket(options.serverUrl, timeoutMs);
    const resumedGuest = successfulData(
      await waitForAck<ResumeSessionResult>(
        reconnectedGuest,
        'resume session',
        { token: guestSession.token },
        timeoutMs,
      ),
      'LAN contract reconnect',
    );
    if (resumedGuest.playerId !== guestSession.result.playerId) {
      throw new Error('LAN contract reconnect changed the guest player id');
    }
    if (resumedGuest.room.roomId !== hostSession.result.room.roomId) {
      throw new Error('LAN contract reconnect changed the room');
    }

    return {
      pass: true,
      roomId: hostSession.result.room.roomId,
      hostPlayerId: hostSession.result.playerId,
      guestPlayerId: guestSession.result.playerId,
      checks: {
        'protocol-v8': true,
        'two-client-connect': true,
        'same-room': true,
        'host-authority-preserved': true,
        'reconnect-same-player-id': true,
        'reconnect-same-room': true,
      },
    };
  } finally {
    reconnectedGuest?.disconnect();
    guest?.disconnect();
    host?.disconnect();
  }
}
