import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

import {
  SOCKET_PROTOCOL_VERSION,
  type Ack,
  type AckCallback,
  type ClientToServerEvents,
  type JoinRoomResult,
  type ResumeSessionResult,
  type ServerToClientEvents,
} from '@monopoly/shared';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';

import type { PersistenceTimingConfig } from './config.js';
import { createServer } from './createServer.js';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import type { RoomSnapshot } from './rooms.js';
import { recoverRoomIfDue } from './services/deadlineScheduler.js';
import { createAppRuntime, type AppRuntime } from './services/runtime.js';
import { registerSocketHandlers } from './socket/index.js';
import type { AppServer } from './socket/types.js';

// Desktop-profile admission: who may create a room, how a pending admission may end, and how the admission
// allowance is shared behind a Cloudflare tunnel. The Host's own window is a header-less loopback connection;
// a tunnel visitor is a loopback connection (the local connector) that carries Cloudflare's visitor header.

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const HOST_ROOM = 'HOST-ROOM';
const HOST_CAPABILITY = 'a'.repeat(64);
const TIMING: PersistenceTimingConfig = {
  reconnectGraceMs: 60_000,
  paymentShortfallActionTimeoutMs: 120_000,
  cardAwaitingDrawTimeoutMs: 20_000,
  cardRevealedTimeoutMs: 30_000,
  emergencyRescueTimeoutMs: 30_000,
  pendingSessionTtlMs: 5 * 60_000,
  terminalSessionRetentionMs: 7 * 24 * 60 * 60_000,
  lobbyRetentionMs: 24 * 60 * 60_000,
  inProgressRetentionMs: 30 * 24 * 60 * 60_000,
  finishedRetentionMs: 7 * 24 * 60 * 60_000,
};

interface RunningServer {
  persistence: InMemoryPersistenceStore<RoomSnapshot>;
  runtime: AppRuntime;
  io: AppServer;
  url: string;
}

const closers: Array<() => Promise<void>> = [];
const sockets: TestSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function startServer(options: {
  /** Online Host: the process knows a managed tunnel connector feeds it and reads the visitor header from it. */
  online?: boolean;
  listenHost?: string;
} = {}): Promise<RunningServer> {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const runtime = createAppRuntime(persistence, TIMING);
  const online = options.online ?? true;
  const { server, io } = createServer(runtime, {
    environment: { SERVER_RUNTIME_PROFILE: 'desktop', ...(online ? { OTB_ONLINE_ROOM_CODE: HOST_ROOM } : {}) },
    clientDist: path.resolve('src'),
  });
  registerSocketHandlers(io, runtime, 'desktop', {
    hostAuthorization: { roomCode: HOST_ROOM, secret: HOST_CAPABILITY },
    trustTunnelHeader: online,
  });
  const listenHost = options.listenHost ?? '127.0.0.1';
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, listenHost, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  closers.push(async () => {
    runtime.flags.shuttingDown = true;
    await io.close();
  });
  return { persistence, runtime, io, url: `http://${listenHost}:${String(port)}` };
}

async function connect(url: string, extraHeaders: Record<string, string> = {}): Promise<TestSocket> {
  const socket: TestSocket = createClient(url, {
    auth: { protocolVersion: SOCKET_PROTOCOL_VERSION },
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
    extraHeaders,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 3_000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
  return socket;
}

/** A visitor as the Online Host sees one: the local connector, carrying the address Cloudflare saw. */
const visitor = (url: string, address: string): Promise<TestSocket> => connect(url, { 'CF-Connecting-IP': address });

function ack<TResult>(emit: (acknowledge: AckCallback<TResult>) => void): Promise<Ack<TResult>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket acknowledgement timed out')), 3_000);
    emit((response) => { clearTimeout(timer); resolve(response); });
  });
}

const join = (socket: TestSocket, name: string, roomCode: string, hostCapability?: string): Promise<Ack<JoinRoomResult>> => (
  ack<JoinRoomResult>((acknowledge) => socket.emit(
    'join room',
    { name, roomCode, ...(hostCapability ? { hostCapability } : {}) },
    acknowledge,
  ))
);

async function admit(
  socket: TestSocket,
  name: string,
  roomCode: string,
  hostCapability?: string,
): Promise<ResumeSessionResult> {
  const admission = await join(socket, name, roomCode, hostCapability);
  if (!admission.ok || admission.data.kind !== 'PENDING') {
    throw new Error(`Expected a pending admission, received ${JSON.stringify(admission)}`);
  }
  const { token } = admission.data;
  const resumed = await ack<ResumeSessionResult>((acknowledge) => {
    socket.emit('resume session', { token }, acknowledge);
  });
  if (!resumed.ok) throw new Error(`Expected a resumed session, received ${JSON.stringify(resumed)}`);
  return resumed.data;
}

const lanAddress = (): string | undefined => Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .find((entry) => entry.family === 'IPv4' && !entry.internal)?.address;

describe('Host-only room creation', () => {
  it('lets the desktop Host create the room it was authorized for and become its stable Host', async () => {
    const subject = await startServer();
    const host = await admit(await connect(subject.url), 'Host', HOST_ROOM, HOST_CAPABILITY);
    expect(host.room.hostPlayerId).toBe(host.playerId);
    expect((await subject.persistence.rooms.findByCode(HOST_ROOM))?.hostPlayerId).toBe(host.playerId);
  });

  it('keeps a remote visitor that arrives before the Host from creating, reserving or owning the room', async () => {
    const subject = await startServer();
    const early = await visitor(subject.url, '203.0.113.5');
    expect(await join(early, 'Early visitor', HOST_ROOM)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await subject.persistence.rooms.findByCode(HOST_ROOM)).toBeNull();

    const host = await admit(await connect(subject.url), 'Host', HOST_ROOM, HOST_CAPABILITY);
    const guest = await admit(early, 'Early visitor', HOST_ROOM);
    expect(guest.room.hostPlayerId).toBe(host.playerId);
    expect(guest.playerId).not.toBe(host.playerId);
  });

  it('ignores every identity a remote client can forge', async () => {
    const subject = await startServer();
    const forgeries: Array<Record<string, string>> = [
      { 'CF-Connecting-IP': '127.0.0.1' },
      { 'X-Forwarded-For': '127.0.0.1, ::1' },
      { 'True-Client-IP': '127.0.0.1' },
      { Origin: 'app://own-the-block' },
      { 'X-Otb-Host-Capability': HOST_CAPABILITY, 'X-Host-Capability': HOST_CAPABILITY },
      { Authorization: `Bearer ${HOST_CAPABILITY}`, Cookie: `hostCapability=${HOST_CAPABILITY}` },
    ];
    for (const headers of forgeries) {
      const forger = await connect(subject.url, headers);
      expect(await join(forger, 'Forger', HOST_ROOM)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    }
    expect(await subject.persistence.rooms.findByCode(HOST_ROOM)).toBeNull();
  });

  it('rejects a wrong, foreign or malformed capability and creates nothing', async () => {
    const subject = await startServer();
    const socket = await visitor(subject.url, '203.0.113.6');
    expect(await join(socket, 'Guess', HOST_ROOM, 'b'.repeat(64))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    // The right secret is bound to its own room code: it creates no other room.
    expect(await join(socket, 'Guess', 'OTHER-ROOM', HOST_CAPABILITY)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    // A malformed capability never reaches the comparison.
    for (const malformed of ['A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64)]) {
      expect(await join(socket, 'Guess', HOST_ROOM, malformed)).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    }
    expect(await subject.persistence.rooms.findByCode(HOST_ROOM)).toBeNull();
    expect(await subject.persistence.rooms.findByCode('OTHER-ROOM')).toBeNull();
  });

  it('never turns a guessed room code into permission to create a room', async () => {
    const subject = await startServer();
    for (const code of ['ABC123', 'OTB-AAAAAA', 'OTB-000000', HOST_ROOM.toLowerCase(), 'LOBBY', 'ROOM']) {
      const guesser = await visitor(subject.url, `198.51.100.${String(code.length)}`);
      expect(await join(guesser, 'Guesser', code)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(await subject.persistence.rooms.findByCode(code)).toBeNull();
    }
  });

  it('gives a reconnecting or resumed player no more authority than their seat', async () => {
    const subject = await startServer();
    const hostSocket = await connect(subject.url);
    const host = await admit(hostSocket, 'Host', HOST_ROOM, HOST_CAPABILITY);
    const guestSocket = await visitor(subject.url, '203.0.113.7');
    const guestAdmission = await join(guestSocket, 'Guest', HOST_ROOM);
    if (!guestAdmission.ok || guestAdmission.data?.kind !== 'PENDING') throw new Error('Expected a Guest admission');
    const token = guestAdmission.data.token;

    // The resume payload is a strict object: it cannot smuggle a capability.
    expect(await ack<ResumeSessionResult>((acknowledge) => (
      guestSocket.emit('resume session', { token, hostCapability: HOST_CAPABILITY } as never, acknowledge)
    ))).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });

    const resumed = await ack<ResumeSessionResult>((acknowledge) => guestSocket.emit('resume session', { token }, acknowledge));
    expect(resumed).toMatchObject({ ok: true });
    expect(resumed.ok && resumed.data?.room.hostPlayerId).toBe(host.playerId);
    // A joined socket cannot start a second admission, and a fresh reconnect cannot create another room.
    expect(await join(guestSocket, 'Guest', 'NEW-ROOM', HOST_CAPABILITY)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const reconnected = await visitor(subject.url, '203.0.113.7');
    const again = await ack<ResumeSessionResult>((acknowledge) => reconnected.emit('resume session', { token }, acknowledge));
    expect(again.ok && again.data?.room.hostPlayerId).toBe(host.playerId);
    expect(await join(await visitor(subject.url, '203.0.113.7'), 'Guest', 'NEW-ROOM')).toMatchObject({
      ok: false, error: { code: 'NOT_FOUND' },
    });
  });

  it('seats four players behind one connector with the Host unchanged, and no fifth', async () => {
    const subject = await startServer();
    const host = await admit(await connect(subject.url), 'Host', HOST_ROOM, HOST_CAPABILITY);
    for (let index = 0; index < 3; index += 1) {
      const guest = await admit(await visitor(subject.url, `203.0.113.${String(10 + index)}`), `Guest ${String(index)}`, HOST_ROOM);
      expect(guest.room.hostPlayerId).toBe(host.playerId);
    }
    expect(await join(await visitor(subject.url, '203.0.113.99'), 'Fifth', HOST_ROOM)).toMatchObject({
      ok: false, error: { code: 'ROOM_FULL' },
    });
  });

  it.skipIf(lanAddress() === undefined)('keeps a LAN device from creating a room or borrowing the connector\'s trust', async () => {
    const address = lanAddress() as string;
    const subject = await startServer({ listenHost: address });
    // A LAN device reaches the game port directly: its peer is its own address, so a Cloudflare header changes nothing.
    const lan = await connect(subject.url, { 'CF-Connecting-IP': '127.0.0.1', 'X-Forwarded-For': '127.0.0.1' });
    expect(await join(lan, 'LAN guest', HOST_ROOM)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await subject.persistence.rooms.findByCode(HOST_ROOM)).toBeNull();
    // Without the Host capability nothing about being on the LAN is enough; with it the same peer may create.
    const host = await admit(lan, 'LAN host', HOST_ROOM, HOST_CAPABILITY);
    expect(host.room.hostPlayerId).toBe(host.playerId);
  });
});

describe('two-step admission lifecycle', () => {
  const newRuntime = (): { persistence: InMemoryPersistenceStore<RoomSnapshot>; runtime: AppRuntime } => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    return { persistence, runtime: createAppRuntime(persistence, TIMING) };
  };
  const pending = async (runtime: AppRuntime, name: string, code: string, mayCreate: boolean): Promise<string> => {
    const admission = await runtime.sessions.beginAdmission(name, code, new Date(), mayCreate);
    if (admission.kind !== 'PENDING') throw new Error('Expected a pending admission');
    return admission.token;
  };

  it('does not let a Guest recreate the room that disappeared under their pending admission', async () => {
    const { persistence, runtime } = newRuntime();
    const original = await runtime.sessions.resume(await pending(runtime, 'Host', 'STALE-ROOM', true));
    const guestToken = await pending(runtime, 'Guest', 'STALE-ROOM', false);
    await persistence.rooms.delete(original.room.id);

    await expect(runtime.sessions.resume(guestToken)).rejects.toMatchObject({ code: 'ROOM_GONE' });
    expect(await persistence.rooms.findByCode('STALE-ROOM')).toBeNull();
    // Retrying the same token cannot change the outcome.
    await expect(runtime.sessions.resume(guestToken)).rejects.toMatchObject({ code: 'ROOM_GONE' });
    expect(await persistence.rooms.findByCode('STALE-ROOM')).toBeNull();
  });

  it('keeps a stale pending Guest out of a replacement room that reuses the code', async () => {
    const { persistence, runtime } = newRuntime();
    const original = await runtime.sessions.resume(await pending(runtime, 'Host', 'STALE-ROOM', true));
    const guestToken = await pending(runtime, 'Guest', 'STALE-ROOM', false);
    await persistence.rooms.delete(original.room.id);
    const replacement = await runtime.sessions.resume(await pending(runtime, 'New Host', 'STALE-ROOM', true));
    expect(replacement.room.id).not.toBe(original.room.id);

    await expect(runtime.sessions.resume(guestToken)).rejects.toMatchObject({ code: 'ROOM_GONE' });
    const room = await persistence.rooms.findByCode('STALE-ROOM');
    expect(room?.hostPlayerId).toBe(replacement.playerId);
    expect(Object.keys(room?.gameSnapshot.members ?? {})).toEqual([replacement.playerId]);
  });

  it('settles a Host and a Guest racing for the same new room the same way in either order', async () => {
    for (const hostFirst of [true, false]) {
      const { persistence, runtime } = newRuntime();
      const startHost = (): Promise<string> => pending(runtime, 'Host', 'RACE-ROOM', true);
      const startGuest = (): Promise<string> => pending(runtime, 'Guest', 'RACE-ROOM', false);
      const [first, second] = await Promise.allSettled(hostFirst ? [startHost(), startGuest()] : [startGuest(), startHost()]);
      const hostOutcome = hostFirst ? first : second;
      const guestOutcome = hostFirst ? second : first;
      expect(guestOutcome).toMatchObject({ status: 'rejected', reason: { code: 'NOT_FOUND' } });
      if (hostOutcome?.status !== 'fulfilled') throw new Error('The Host admission must succeed');
      // Nothing exists until the Host activates; the Guest never held a seat or a creation right.
      expect(await persistence.rooms.findByCode('RACE-ROOM')).toBeNull();
      const host = await runtime.sessions.resume(hostOutcome.value);
      expect((await persistence.rooms.findByCode('RACE-ROOM'))?.hostPlayerId).toBe(host.playerId);
    }
  });

  it('cannot activate an expired pending admission into a room', async () => {
    const { persistence, runtime } = newRuntime();
    const expired = await runtime.sessions.beginAdmission(
      'Host',
      'EXPIRED-ROOM',
      new Date(Date.now() - TIMING.pendingSessionTtlMs - 1_000),
      true,
    );
    if (expired.kind !== 'PENDING') throw new Error('Expected a pending admission');
    await expect(runtime.sessions.resume(expired.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(await persistence.rooms.findByCode('EXPIRED-ROOM')).toBeNull();
  });

  it('keeps a room deleted by expiry deleted when a Guest activates afterwards', async () => {
    const subject = await startServer();
    const host = await subject.runtime.sessions.resume(await pending(subject.runtime, 'Host', 'SHORT-ROOM', true));
    const guestToken = await pending(subject.runtime, 'Guest', 'SHORT-ROOM', false);

    await recoverRoomIfDue(
      subject.io,
      subject.runtime,
      host.room.id,
      new Date(Date.now() + TIMING.lobbyRetentionMs + 1_000),
    );
    expect(await subject.persistence.rooms.findByCode('SHORT-ROOM')).toBeNull();

    await expect(subject.runtime.sessions.resume(guestToken)).rejects.toMatchObject({ code: 'ROOM_GONE' });
    expect(await subject.persistence.rooms.findByCode('SHORT-ROOM')).toBeNull();
  });

  it('creates no pending row for a Guest who names a room that does not exist', async () => {
    const { persistence, runtime } = newRuntime();
    await expect(runtime.sessions.beginAdmission('Guest', 'NOWHERE', new Date(), false))
      .rejects.toMatchObject({ code: 'NOT_FOUND', retryable: false });
    // `expireDue` counts only pending rows; none was written to expire.
    expect(await persistence.playerSessions.expireDue(new Date(Date.now() + TIMING.pendingSessionTtlMs + 1_000), 100)).toBe(0);
    expect(await persistence.rooms.findByCode('NOWHERE')).toBeNull();
  });

  it('still seats a legitimate Guest in an existing lobby and a Host in a fresh one', async () => {
    const { persistence, runtime } = newRuntime();
    const host = await runtime.sessions.resume(await pending(runtime, 'Host', 'LIVE-ROOM', true));
    const guest = await runtime.sessions.resume(await pending(runtime, 'Guest', 'LIVE-ROOM', false));
    expect(guest.room.id).toBe(host.room.id);
    expect((await persistence.rooms.findByCode('LIVE-ROOM'))?.hostPlayerId).toBe(host.playerId);
    expect(Object.keys((await persistence.rooms.findByCode('LIVE-ROOM'))?.gameSnapshot.members ?? {})).toHaveLength(2);
  });
});

describe('admission allowance behind a Cloudflare tunnel', () => {
  const attempt = (socket: TestSocket, roomCode = 'MISSING-ROOM'): Promise<Ack<JoinRoomResult>> => join(socket, 'Visitor', roomCode);
  const outcomes = async (acknowledgements: Array<Promise<Ack<JoinRoomResult>>>): Promise<string[]> => (
    (await Promise.all(acknowledgements)).map((response) => (response.ok ? 'OK' : response.error.code))
  );

  it('lets the Host and four visitors, each with their own address, all get in', async () => {
    const subject = await startServer();
    const host = await admit(await connect(subject.url), 'Host', HOST_ROOM, HOST_CAPABILITY);
    for (let index = 0; index < 3; index += 1) {
      const guest = await admit(await visitor(subject.url, `198.51.100.${String(20 + index)}`), `Guest ${String(index)}`, HOST_ROOM);
      expect(guest.room.hostPlayerId).toBe(host.playerId);
    }
  });

  it('lets players who share one public address all join', async () => {
    const subject = await startServer();
    await admit(await connect(subject.url), 'Host', HOST_ROOM, HOST_CAPABILITY);
    for (let index = 0; index < 3; index += 1) {
      await admit(await visitor(subject.url, '203.0.113.50'), `Roommate ${String(index)}`, HOST_ROOM);
    }
  });

  it('limits one flooding visitor without touching anyone else behind the same connector', async () => {
    const subject = await startServer();
    const flooders = await Promise.all(Array.from({ length: 6 }, () => visitor(subject.url, '203.0.113.99')));
    const results: string[] = [];
    for (let round = 0; round < 6; round += 1) {
      results.push(...await outcomes(flooders.map((socket) => attempt(socket))));
    }
    // 36 attempts from one address: 30 reach the lookup, the rest are throttled and told to retry.
    expect(results.filter((code) => code === 'NOT_FOUND')).toHaveLength(30);
    expect(results.filter((code) => code === 'CONFLICT')).toHaveLength(6);
    const throttled = await attempt(flooders[0]);
    expect(throttled).toMatchObject({ ok: false, error: { code: 'CONFLICT', retryable: true } });

    // Another visitor and the Host are unaffected.
    expect(await attempt(await visitor(subject.url, '203.0.113.100'))).toMatchObject({ error: { code: 'NOT_FOUND' } });
    const host = await admit(await connect(subject.url), 'Host', HOST_ROOM, HOST_CAPABILITY);
    expect(host.room.hostPlayerId).toBe(host.playerId);
  });

  it('limits repeated attempts on one connection even from a fresh address', async () => {
    const subject = await startServer();
    const socket = await visitor(subject.url, '203.0.113.60');
    for (let index = 0; index < 8; index += 1) {
      expect(await attempt(socket)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    }
    expect(await attempt(socket)).toMatchObject({ ok: false, error: { code: 'CONFLICT', retryable: true } });
  });

  it('does not let rotating a forwarding header mint more allowance when no tunnel feeds the Host', async () => {
    const subject = await startServer({ online: false });
    const results: string[] = [];
    for (let round = 0; round < 6; round += 1) {
      const sockets = await Promise.all(Array.from({ length: 6 }, (_unused, index) => (
        visitor(subject.url, `203.0.113.${String(round * 6 + index + 1)}`)
      )));
      results.push(...await outcomes(sockets.map((socket) => attempt(socket))));
    }
    // Every header is different, but a LAN Host has no connector to vouch for it: one `local` allowance.
    expect(results.filter((code) => code === 'NOT_FOUND')).toHaveLength(30);
    expect(results.filter((code) => code === 'CONFLICT')).toHaveLength(6);
  });

  it.skipIf(lanAddress() === undefined)('does not let a LAN device rotate the header to escape its own allowance', async () => {
    const subject = await startServer({ listenHost: lanAddress() as string });
    const results: string[] = [];
    for (let round = 0; round < 6; round += 1) {
      const sockets = await Promise.all(Array.from({ length: 6 }, (_unused, index) => (
        connect(subject.url, { 'CF-Connecting-IP': `203.0.113.${String(round * 6 + index + 1)}` })
      )));
      results.push(...await outcomes(sockets.map((socket) => attempt(socket))));
    }
    expect(results.filter((code) => code === 'NOT_FOUND')).toHaveLength(30);
    expect(results.filter((code) => code === 'CONFLICT')).toHaveLength(6);
  });
});

describe('a closed runtime', () => {
  it('answers admission and reconnect with a non-retryable service error and leaks nothing', async () => {
    const subject = await startServer();
    const socket = await connect(subject.url);
    await subject.persistence.close();

    for (const response of [
      await join(socket, 'Host', HOST_ROOM, HOST_CAPABILITY),
      await ack<ResumeSessionResult>((acknowledge) => socket.emit('resume session', { token: 'A'.repeat(43) }, acknowledge)),
    ]) {
      expect(response).toEqual({
        ok: false,
        protocolVersion: SOCKET_PROTOCOL_VERSION,
        error: { code: 'INTERNAL_ERROR', message: 'The game service is shutting down.', retryable: false },
      });
    }
  });
});
