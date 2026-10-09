import type { AddressInfo } from 'node:net';

import { randomUUID } from 'node:crypto';

import {
  SOCKET_PROTOCOL_VERSION,
  type Ack,
  type AddBotResult,
  type AckCallback,
  type CharacterId,
  type ClientToServerEvents,
  type GameMode,
  type JoinRoomResult,
  type LeaveRoomResult,
  type PlayerColorId,
  type PublicRoomState,
  type ResumeSessionResult,
  type ServerToClientEvents,
  type TeamId,
  type TeamSlot,
} from '@monopoly/shared';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach } from 'vitest';

import { BotDriver, type BotDriverOptions } from '../bots/driver.js';
import type { PersistenceTimingConfig } from '../config.js';
import { createServer } from '../createServer.js';
import { InMemoryPersistenceStore } from '../persistence/inMemory.js';
import type { PersistenceStore, RoomRecord } from '../persistence/types.js';
import type { RoomSnapshot } from '../rooms.js';
import { createAppRuntime, type AppRuntime } from '../services/runtime.js';
import { registerSocketHandlers } from '../socket/index.js';
import type { AppServer } from '../socket/types.js';

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

export interface RunningServer {
  runtime: AppRuntime;
  io: AppServer;
  /** Present when the server was started with bot options. */
  bots?: BotDriver;
  url: string;
  close: () => Promise<void>;
}

export interface Player {
  socket: TestSocket;
  token: string;
  playerId: string;
  room: PublicRoomState;
}

export const TIMING: PersistenceTimingConfig = {
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

const servers: RunningServer[] = [];
const sockets: TestSocket[] = [];
let roomCounter = 0;

export function useHarnessCleanup(): void {
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });
}

export async function startServer(
  persistence: PersistenceStore<RoomSnapshot> = new InMemoryPersistenceStore<RoomSnapshot>(),
  options: { bots?: BotDriverOptions; timing?: Partial<PersistenceTimingConfig> } = {},
): Promise<RunningServer> {
  const runtime = createAppRuntime(persistence, { ...TIMING, ...options.timing });
  const { server, io } = createServer(runtime);
  registerSocketHandlers(io, runtime, 'development');
  const bots = options.bots ? new BotDriver(io, runtime, options.bots) : undefined;
  if (bots) {
    runtime.bots = bots;
    bots.start();
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  let closed = false;
  const running: RunningServer = {
    runtime,
    io,
    bots,
    url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    close: async () => {
      if (closed) return;
      closed = true;
      runtime.flags.shuttingDown = true;
      bots?.stop();
      await io.close();
    },
  };
  servers.push(running);
  return running;
}

export async function connect(url: string): Promise<TestSocket> {
  const socket: TestSocket = createClient(url, {
    auth: { protocolVersion: SOCKET_PROTOCOL_VERSION },
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 2_000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
  return socket;
}

export function ack<T = void>(emit: (acknowledge: AckCallback<T>) => void): Promise<Ack<T>> {
  // The error is created here so that a timeout names the call site of the command that never answered.
  const timeout = new Error('Socket acknowledgement timed out');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(timeout), 2_000);
    emit((acknowledgement) => { clearTimeout(timer); resolve(acknowledgement); });
  });
}

export function dataOf<T>(acknowledgement: Ack<T>): T {
  if (!acknowledgement.ok || acknowledgement.data === undefined) {
    throw new Error(`Expected data, received ${JSON.stringify(acknowledgement)}`);
  }
  return acknowledgement.data;
}

export function okOf<T>(acknowledgement: Ack<T>): void {
  if (!acknowledgement.ok) {
    throw new Error(`Expected success, received ${acknowledgement.error.code}: ${acknowledgement.error.message}`);
  }
}

export function failureOf<T>(acknowledgement: Ack<T>): { code: string; message: string } {
  if (acknowledgement.ok) throw new Error('Expected a failure acknowledgement');
  return acknowledgement.error;
}

export async function join(socket: TestSocket, name: string, roomCode: string): Promise<Player> {
  const admission = dataOf(await ack<JoinRoomResult>((callback) => {
    socket.emit('join room', { name, roomCode }, callback);
  }));
  if (admission.kind !== 'PENDING') throw new Error('Expected a pending admission');
  const resumed = await resume(socket, admission.token);
  return { socket, token: admission.token, playerId: resumed.playerId, room: resumed.room };
}

export async function resume(socket: TestSocket, token: string): Promise<ResumeSessionResult> {
  return dataOf(await ack<ResumeSessionResult>((callback) => socket.emit('resume session', { token }, callback)));
}

export const setMode = (socket: TestSocket, mode: GameMode) => ack((cb) => socket.emit('set game mode', { mode }, cb));
export const setTeamName = (socket: TestSocket, name: string) => ack((cb) => socket.emit('set team name', { name }, cb));
export const setTeamColor = (socket: TestSocket, color: PlayerColorId) => ack((cb) => socket.emit('set team color', { color }, cb));
export const kick = (socket: TestSocket, playerId: string) => ack((cb) => socket.emit('kick player', { playerId }, cb));
export const addBot = (socket: TestSocket, requestId: string = randomUUID()) => ack<AddBotResult>((cb) => socket.emit('add bot', { requestId }, cb));
export const removeBot = (socket: TestSocket, playerId: string) => ack((cb) => socket.emit('remove bot', { playerId }, cb));
export const moveToSeat = (socket: TestSocket, teamId: TeamId, teamSlot: TeamSlot) => ack((cb) => socket.emit('move to seat', { teamId, teamSlot }, cb));
export const requestSeatSwap = (socket: TestSocket, targetPlayerId: string) => ack((cb) => socket.emit('request seat swap', { targetPlayerId }, cb));
export const cancelSeatSwap = (socket: TestSocket) => ack((cb) => socket.emit('cancel seat swap', cb));
export const respondSeatSwap = (socket: TestSocket, requesterPlayerId: string, accept: boolean) => ack((cb) => socket.emit('respond seat swap', { requesterPlayerId, accept }, cb));
/** The requester asks and the target accepts: the two exchange seats. */
export async function swapSeats(requester: Player, target: Player): Promise<void> {
  okOf(await requestSeatSwap(requester.socket, target.playerId));
  okOf(await respondSeatSwap(target.socket, requester.playerId, true));
}
export const appearance = (socket: TestSocket, request: { characterId?: CharacterId; color?: PlayerColorId }) => ack((cb) => socket.emit('set appearance', request, cb));
export const ready = (socket: TestSocket, value = true) => ack((cb) => socket.emit('set ready', { ready: value }, cb));
export const start = (socket: TestSocket) => ack((cb) => socket.emit('start game', cb));
export const playAgain = (socket: TestSocket) => ack((cb) => socket.emit('play again', cb));
export const leave = (socket: TestSocket) => ack<LeaveRoomResult>((cb) => socket.emit('leave room', cb));
export const revive = (socket: TestSocket) => ack((cb) => socket.emit('revive teammate', cb));
export const acceptRescue = (socket: TestSocket, rescueId: string) => ack((cb) => socket.emit('accept rescue', { rescueId }, cb));
export const declineRescue = (socket: TestSocket, rescueId: string) => ack((cb) => socket.emit('decline rescue', { rescueId }, cb));
export const develop = (socket: TestSocket, request: Parameters<ClientToServerEvents['resolve development']>[0]) => ack((cb) => socket.emit('resolve development', request, cb));

export async function mutateRoom(
  persistence: PersistenceStore<RoomSnapshot>,
  roomId: string,
  mutate: (room: RoomRecord<RoomSnapshot>) => void,
): Promise<RoomRecord<RoomSnapshot>> {
  const room = await persistence.rooms.findById(roomId);
  if (!room) throw new Error('room missing');
  mutate(room);
  return persistence.rooms.save({
    id: room.id,
    expectedVersion: room.aggregateVersion,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    snapshotSchemaVersion: room.snapshotSchemaVersion,
    gameSnapshot: room.gameSnapshot,
    nextActionAt: room.nextActionAt,
    lastActivityAt: room.lastActivityAt,
    expiresAt: room.expiresAt,
  });
}

export async function stored(persistence: PersistenceStore<RoomSnapshot>, roomId: string): Promise<RoomRecord<RoomSnapshot>> {
  const room = await persistence.rooms.findById(roomId);
  if (!room) throw new Error('room missing');
  return room;
}

/** Four players in one lobby, joined in order (Team 1, Team 2, Team 1, Team 2). */
export async function lobbyOfFour(): Promise<{
  subject: RunningServer;
  persistence: InMemoryPersistenceStore<RoomSnapshot>;
  players: [Player, Player, Player, Player];
  roomId: string;
}> {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const subject = await startServer(persistence);
  roomCounter += 1;
  const code = `TEAMS-${String(roomCounter)}`;
  const players: Player[] = [];
  for (const name of ['Harvey', 'Nora', 'Alex', 'Zed']) {
    players.push(await join(await connect(subject.url), name, code));
  }
  return {
    subject,
    persistence,
    players: players as [Player, Player, Player, Player],
    roomId: players[0].room.roomId,
  };
}

/** Mascots chosen so both teams are valid: the same mascot (dog) appears on opposing teams only. */
export const MASCOTS: CharacterId[] = ['dog', 'dog', 'cat', 'panda'];

export async function readyEveryone(players: Player[]): Promise<void> {
  for (const [index, player] of players.entries()) {
    okOf(await appearance(player.socket, { characterId: MASCOTS[index] }));
    okOf(await ready(player.socket));
  }
}

/** A started 2v2 game. Slot order is deterministic afterwards because the test sets the current player itself. */
export async function startedTeamGame() {
  const lobby = await lobbyOfFour();
  okOf(await setMode(lobby.players[0].socket, 'TEAM_2V2'));
  await readyEveryone(lobby.players);
  okOf(await start(lobby.players[0].socket));
  return lobby;
}
