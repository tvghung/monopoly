import {
  SOCKET_PROTOCOL_VERSION,
  type Ack,
  type AckCallback,
  type ClientToServerEvents,
  type JoinRoomResult,
  type ResumeSessionResult,
  type ServerToClientEvents,
  type SessionReplacedInfo,
} from '@monopoly/shared';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const CONTRACT_TIMEOUT_MS = 5_000;

export interface RetainedPhase72Session {
  token: string;
  playerId: string;
  roomId: string;
  roomCode: string;
}

export interface Phase72HostContractResult {
  pass: true;
  roomId: string;
  hostPlayerId: string;
  retainedSession: RetainedPhase72Session;
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
    const timer = setTimeout(
      () => reject(new Error('Phase 7.2 socket connection timed out')),
      timeoutMs,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', error => {
      clearTimeout(timer);
      reject(new Error(`Phase 7.2 socket connection failed: ${error.message}`));
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
    const timer = setTimeout(
      () => reject(new Error(`Phase 7.2 ${event} acknowledgement timed out`)),
      timeoutMs,
    );
    const acknowledge: AckCallback<TResult> = response => {
      clearTimeout(timer);
      resolve(response);
    };
    if (event === 'join room') {
      socket.emit(
        event,
        payload as Parameters<ClientToServerEvents['join room']>[0],
        acknowledge as AckCallback<JoinRoomResult>,
      );
    } else {
      socket.emit(
        event,
        payload as Parameters<ClientToServerEvents['resume session']>[0],
        acknowledge as AckCallback<ResumeSessionResult>,
      );
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
    'Phase 7.2 admission',
  );
  if (admission.kind !== 'PENDING') throw new Error('Phase 7.2 expected player admission');
  return {
    token: admission.token,
    result: successfulData(
      await waitForAck<ResumeSessionResult>(
        socket,
        'resume session',
        { token: admission.token },
        timeoutMs,
      ),
      'Phase 7.2 activation',
    ),
  };
}

async function waitForSessionReplaced(socket: TestSocket, timeoutMs: number): Promise<SessionReplacedInfo> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Phase 7.2 session replacement timed out')),
      timeoutMs,
    );
    socket.once('session replaced', info => {
      clearTimeout(timer);
      resolve(info);
    });
  });
}

export async function resumePhase72RetainedSession(options: {
  serverUrl: string;
  session: RetainedPhase72Session;
  timeoutMs?: number;
}): Promise<Record<string, true>> {
  const timeoutMs = options.timeoutMs ?? CONTRACT_TIMEOUT_MS;
  const socket = await connectSocket(options.serverUrl, timeoutMs);
  try {
    const resumed = successfulData(
      await waitForAck<ResumeSessionResult>(
        socket,
        'resume session',
        { token: options.session.token },
        timeoutMs,
      ),
      'Phase 7.2 retained-session resume',
    );
    if (resumed.playerId !== options.session.playerId
      || resumed.room.roomId !== options.session.roomId
      || resumed.room.roomCode !== options.session.roomCode) {
      throw new Error('Phase 7.2 retained session changed identity or room');
    }
    return {
      'restart-reconnect-same-player-id': true,
      'restart-reconnect-same-room': true,
    };
  } finally {
    socket.disconnect();
  }
}

export async function runPhase72HostContract(options: {
  serverUrl: string;
  remoteServerUrl: string;
  roomCode: string;
  timeoutMs?: number;
}): Promise<Phase72HostContractResult> {
  const timeoutMs = options.timeoutMs ?? CONTRACT_TIMEOUT_MS;
  const sockets: TestSocket[] = [];
  try {
    const players: Array<{ token: string; result: ResumeSessionResult }> = [];
    for (let index = 0; index < 4; index += 1) {
      const socket = await connectSocket(options.serverUrl, timeoutMs);
      sockets.push(socket);
      players.push(await joinPlayer(
        socket,
        index === 0 ? 'Host' : `Guest ${String(index)}`,
        options.roomCode,
        timeoutMs,
      ));
    }

    const [host, reconnectingGuest] = players;
    if (!host || !reconnectingGuest) throw new Error('Phase 7.2 player setup failed');
    if (players.some(player => player.result.room.roomId !== host.result.room.roomId)) {
      throw new Error('Phase 7.2 clients did not enter the same room');
    }
    if (players.some(player => player.result.room.hostPlayerId !== host.result.playerId)) {
      throw new Error('Phase 7.2 did not preserve the first player as host');
    }

    const wrongRoom = await connectSocket(options.remoteServerUrl, timeoutMs);
    sockets.push(wrongRoom);
    const missing = await waitForAck<JoinRoomResult>(
      wrongRoom,
      'join room',
      { name: 'Wrong Room', roomCode: `${options.roomCode}-MISS` },
      timeoutMs,
    );
    if (missing.ok || missing.error.code !== 'NOT_FOUND') {
      throw new Error('Phase 7.2 remote admission created an unknown room code');
    }

    const fifth = await connectSocket(options.serverUrl, timeoutMs);
    sockets.push(fifth);
    const rejected = await waitForAck<JoinRoomResult>(
      fifth,
      'join room',
      { name: 'Guest 4', roomCode: options.roomCode },
      timeoutMs,
    );
    if (rejected.ok || rejected.error.code !== 'ROOM_FULL') {
      throw new Error('Phase 7.2 did not reject the fifth active player');
    }

    sockets[1]?.disconnect();
    const reconnected = await connectSocket(options.serverUrl, timeoutMs);
    sockets.push(reconnected);
    const resumed = successfulData(
      await waitForAck<ResumeSessionResult>(
        reconnected,
        'resume session',
        { token: reconnectingGuest.token },
        timeoutMs,
      ),
      'Phase 7.2 reconnect',
    );
    if (resumed.playerId !== reconnectingGuest.result.playerId
      || resumed.room.roomId !== host.result.room.roomId) {
      throw new Error('Phase 7.2 reconnect changed player identity or room');
    }

    const replacement = await connectSocket(options.serverUrl, timeoutMs);
    sockets.push(replacement);
    const replacedEvent = waitForSessionReplaced(reconnected, timeoutMs);
    const newest = successfulData(
      await waitForAck<ResumeSessionResult>(
        replacement,
        'resume session',
        { token: reconnectingGuest.token },
        timeoutMs,
      ),
      'Phase 7.2 newest connection',
    );
    if ((await replacedEvent).code !== 'SESSION_REPLACED'
      || newest.playerId !== reconnectingGuest.result.playerId) {
      throw new Error('Phase 7.2 newest connection did not replace the stale connection');
    }

    return {
      pass: true,
      roomId: host.result.room.roomId,
      hostPlayerId: host.result.playerId,
      retainedSession: {
        token: reconnectingGuest.token,
        playerId: reconnectingGuest.result.playerId,
        roomId: host.result.room.roomId,
        roomCode: host.result.room.roomCode,
      },
      checks: {
        [`protocol-v${SOCKET_PROTOCOL_VERSION}`]: true,
        'four-client-connect': true,
        'same-room': true,
        'stable-host': true,
        'remote-wrong-room-not-found': true,
        'fifth-player-room-full': true,
        'reconnect-same-player-id': true,
        'reconnect-same-room': true,
        'newest-connection-wins': true,
      },
    };
  } finally {
    for (const socket of sockets) socket.disconnect();
  }
}
