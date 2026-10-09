import { randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { continuityMessage, type HostContinuityProof } from '@monopoly/shared';
import { afterEach, describe, expect, it } from 'vitest';

import type { PersistenceTimingConfig } from './config.js';
import { createServer } from './createServer.js';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import { createRoomSnapshot, ROOM_SNAPSHOT_SCHEMA_VERSION, type RoomSnapshot } from './rooms.js';
import { createAppRuntime, type AppRuntime } from './services/runtime.js';

const timing: PersistenceTimingConfig = {
  reconnectGraceMs: 60_000,
  paymentShortfallActionTimeoutMs: 120_000,
  cardAwaitingDrawTimeoutMs: 20_000,
  cardRevealedTimeoutMs: 30_000,
  emergencyRescueTimeoutMs: 30_000,
  pendingSessionTtlMs: 300_000,
  terminalSessionRetentionMs: 604_800_000,
  lobbyRetentionMs: 86_400_000,
  inProgressRetentionMs: 2_592_000_000,
  finishedRetentionMs: 604_800_000,
};

const servers: Array<ReturnType<typeof createServer>['server']> = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); })));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A desktop-profile Host process with one room `OTB-ROOM23`. */
async function hostProcess(): Promise<{ runtime: AppRuntime; origin: string; port: number }> {
  const runtime = createAppRuntime(new InMemoryPersistenceStore<RoomSnapshot>(), timing);
  await runtime.persistence.rooms.create({
    id: randomUUID(), code: 'OTB-ROOM23', status: 'LOBBY', hostPlayerId: null, snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
    gameSnapshot: createRoomSnapshot(), nextActionAt: null, lastActivityAt: new Date(), expiresAt: null,
  });
  const clientDist = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-continuity-'));
  directories.push(clientDist);
  await writeFile(path.join(clientDist, 'index.html'), '<main>client</main>');
  const { server } = createServer(runtime, {
    environment: { NODE_ENV: 'production', SERVER_RUNTIME_PROFILE: 'desktop' },
    clientDist,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { runtime, origin: `http://127.0.0.1:${String(port)}`, port };
}

const challenge = (): string => randomBytes(32).toString('base64url');

const ask = (origin: string, query: Record<string, string>, headers: Record<string, string> = {}) => (
  fetch(`${origin}/_otb/continuity?${new URLSearchParams(query).toString()}`, { headers })
);

/** What the client does: verify the proof with the key pinned from the resume ACK, for the exact fields it asked about. */
async function verifies(publicKey: string, proof: HostContinuityProof, expected: { roomCode: string; endpoint: string; challenge: string }) {
  if (proof.roomCode !== expected.roomCode || proof.endpoint !== expected.endpoint || proof.challenge !== expected.challenge) return false;
  const key = await webcrypto.subtle.importKey('spki', Buffer.from(publicKey, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    Buffer.from(proof.signature, 'base64url'),
    Buffer.from(continuityMessage(expected.roomCode, expected.endpoint, expected.challenge)),
  );
}

describe('Host continuity proof (relink security)', () => {
  it('signs a fresh challenge for its own address, and the proof verifies only for that exact request', async () => {
    const { runtime, origin } = await hostProcess();
    const fresh = challenge();
    const response = await ask(origin, { code: 'OTB-ROOM23', challenge: fresh, endpoint: origin });
    expect(response.status).toBe(200);
    const proof = await response.json() as HostContinuityProof;
    expect(await verifies(runtime.continuity.publicKey, proof, { roomCode: 'OTB-ROOM23', endpoint: origin, challenge: fresh })).toBe(true);

    // Replayed for another challenge, altered room or altered address: rejected.
    expect(await verifies(runtime.continuity.publicKey, proof, { roomCode: 'OTB-ROOM23', endpoint: origin, challenge: challenge() })).toBe(false);
    expect(await verifies(runtime.continuity.publicKey, { ...proof, roomCode: 'OTB-OTHER2' }, { roomCode: 'OTB-OTHER2', endpoint: origin, challenge: fresh })).toBe(false);
    const forged = { ...proof, signature: Buffer.from(proof.signature, 'base64url').reverse().toString('base64url') };
    expect(await verifies(runtime.continuity.publicKey, forged, { roomCode: 'OTB-ROOM23', endpoint: origin, challenge: fresh })).toBe(false);
  });

  it('refuses to sign for an address that is not its own, so another Host cannot relay the challenge to it', async () => {
    const { origin } = await hostProcess();
    const relayed = await ask(origin, { code: 'OTB-ROOM23', challenge: challenge(), endpoint: 'https://attacker.trycloudflare.com' });
    expect(relayed.status).toBe(403);
    expect(await relayed.text()).toBe('');
  });

  it('signs for its published tunnel address once Electron main reports it, and stops when it is withdrawn', async () => {
    const { runtime, origin } = await hostProcess();
    const tunnel = 'https://new-host.trycloudflare.com';
    expect((await ask(origin, { code: 'OTB-ROOM23', challenge: challenge(), endpoint: tunnel })).status).toBe(403);
    runtime.continuity.setPublicEndpoints([tunnel, 'https://evil.test', 42]);
    const fresh = challenge();
    const proof = await (await ask(origin, { code: 'OTB-ROOM23', challenge: fresh, endpoint: tunnel })).json() as HostContinuityProof;
    expect(await verifies(runtime.continuity.publicKey, proof, { roomCode: 'OTB-ROOM23', endpoint: tunnel, challenge: fresh })).toBe(true);
    expect((await ask(origin, { code: 'OTB-ROOM23', challenge: challenge(), endpoint: 'https://evil.test' })).status).toBe(403);
    runtime.continuity.setPublicEndpoints([]);
    expect((await ask(origin, { code: 'OTB-ROOM23', challenge: challenge(), endpoint: tunnel })).status).toBe(403);
  });

  it('refuses unknown rooms, malformed challenges and bad codes', async () => {
    const { origin } = await hostProcess();
    expect((await ask(origin, { code: 'OTB-NONE23', challenge: challenge(), endpoint: origin })).status).toBe(404);
    expect((await ask(origin, { code: 'OTB-ROOM23', challenge: 'short', endpoint: origin })).status).toBe(400);
    expect((await ask(origin, { code: 'otb room', challenge: challenge(), endpoint: origin })).status).toBe(400);
  });

  it('is a different identity after a restart: the previous key never verifies the new process', async () => {
    const first = await hostProcess();
    const second = await hostProcess();
    expect(second.runtime.continuity.publicKey).not.toBe(first.runtime.continuity.publicKey);
    const fresh = challenge();
    const proof = await (await ask(second.origin, { code: 'OTB-ROOM23', challenge: fresh, endpoint: second.origin })).json() as HostContinuityProof;
    expect(await verifies(first.runtime.continuity.publicKey, proof, { roomCode: 'OTB-ROOM23', endpoint: second.origin, challenge: fresh })).toBe(false);
  });

  it('lets the game pages read the proof cross-origin and nobody else, and never sends a credential', async () => {
    const { origin } = await hostProcess();
    const query = { code: 'OTB-ROOM23', challenge: challenge(), endpoint: origin };
    const fromGame = await ask(origin, query, { origin: 'https://old-host.trycloudflare.com' });
    expect(fromGame.headers.get('access-control-allow-origin')).toBe('https://old-host.trycloudflare.com');
    const fromElsewhere = await ask(origin, query, { origin: 'https://evil.test' });
    expect(fromElsewhere.headers.get('access-control-allow-origin')).toBeNull();
    const body = await fromElsewhere.text();
    expect(Object.keys(JSON.parse(body) as object).sort()).toEqual(['challenge', 'endpoint', 'roomCode', 'signature', 'version']);
    expect(body).not.toMatch(/token|secret|private|capability/i);
  });
});
