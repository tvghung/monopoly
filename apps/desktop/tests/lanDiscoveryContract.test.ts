import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { SOCKET_PROTOCOL_VERSION } from '../../../packages/shared/src/types';
import * as responder from '../../server/src/lanDiscoveryResponder';
import * as finder from '../src/lanFinder';
import type { NetworkInterfaceCandidate } from '../src/networkInterfaces';

/**
 * The Electron main process has no runtime dependencies, so `lanFinder.ts` repeats the wire constants of the Host
 * helper's `lanDiscoveryResponder.ts` and the socket protocol of `packages/shared`. This file imports both sides: it
 * fails when the copies drift apart, and it runs the real requester against the real responder over loopback UDP.
 */
describe('LAN discovery wire contract', () => {
  it('keeps the repeated constants equal on both sides', () => {
    expect(finder.LAN_DISCOVERY_PORT).toBe(responder.LAN_DISCOVERY_PORT);
    expect(finder.LAN_DISCOVERY_APP).toBe(responder.LAN_DISCOVERY_APP);
    expect(finder.LAN_DISCOVERY_VERSION).toBe(responder.LAN_DISCOVERY_VERSION);
    expect(finder.LAN_DISCOVERY_REQUEST_TYPE).toBe(responder.LAN_DISCOVERY_REQUEST_TYPE);
    expect(finder.LAN_DISCOVERY_REPLY_TYPE).toBe(responder.LAN_DISCOVERY_REPLY_TYPE);
    expect(finder.LAN_DISCOVERY_MAX_REQUEST_BYTES).toBe(responder.LAN_DISCOVERY_MAX_REQUEST_BYTES);
  });

  it('sends the socket protocol of the shared contract', () => {
    expect(finder.LAN_DISCOVERY_SOCKET_PROTOCOL).toBe(SOCKET_PROTOCOL_VERSION);
    const request = JSON.parse(finder.buildFindRoomRequest('OTB-ABC234', 'AbCdEfGhIjKlMnOp').toString('utf8')) as { protocol: number };
    expect(request.protocol).toBe(SOCKET_PROTOCOL_VERSION);
  });

  it('keeps the discovery port documented in the manual checklist', () => {
    expect(finder.LAN_DISCOVERY_PORT).toBe(41_234);
  });

  it('parses a request built by the finder with the responder parser', () => {
    const request = finder.buildFindRoomRequest('OTB-ABC234', 'AbCdEfGhIjKlMnOp');

    expect(responder.parseFindRoomRequest(request)).toEqual({ roomCode: 'OTB-ABC234', nonce: 'AbCdEfGhIjKlMnOp' });
    // The longest legal request still fits the responder size limit.
    const longest = finder.buildFindRoomRequest('A'.repeat(20), 'N'.repeat(32));
    expect(responder.parseFindRoomRequest(longest)).toBeDefined();
  });

  it('parses a reply built by the responder with the finder parser', () => {
    const reply = responder.buildRoomHereReply('AbCdEfGhIjKlMnOp', 53_120);

    expect(finder.parseRoomHereReply(reply, 'AbCdEfGhIjKlMnOp')).toBe(53_120);
    expect(finder.parseRoomHereReply(reply, 'a-different-nonce')).toBeUndefined();
  });

  it('keeps the rate limits above what one search of the finder sends', () => {
    const { sendOffsetsMs } = finder.DEFAULT_LAN_FINDER_TIMING;
    const datagramsPerSourceAddress = sendOffsetsMs.length * 2;

    expect(responder.LAN_DISCOVERY_RATE_LIMITS.source.capacity).toBeGreaterThanOrEqual(datagramsPerSourceAddress);
  });
});

const loopback: NetworkInterfaceCandidate = {
  name: 'Loopback test', displayName: 'Loopback test', address: '127.0.0.1', netmask: '255.0.0.0', preference: 'preferred', rank: 0,
};

const FAST_TIMING = {
  sendOffsetsMs: [0, 100],
  listenWindowMs: 500,
  totalMs: 1_500,
  healthCheckTimeoutMs: 500,
} as const;

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()));
});

async function startHealthServer(): Promise<number> {
  const server = http.createServer((request, response) => {
    if (request.url === '/healthz') response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    else response.writeHead(404).end();
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  cleanups.push(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  return (server.address() as AddressInfo).port;
}

async function startResponder(gamePort: number, rooms: readonly string[]) {
  const started = await responder.startLanDiscoveryResponder({
    gamePort,
    findRoom: roomCode => Promise.resolve(rooms.includes(roomCode)),
    host: '127.0.0.1',
    discoveryPort: 0,
    log: () => undefined,
  });
  if (!started) throw new Error('The loopback responder did not start');
  cleanups.push(() => started.close());
  return started;
}

function loopbackFinder(discoveryPort: number, overrides: Partial<finder.LanFinderOptions> = {}): finder.LanFinder {
  return new finder.LanFinder({
    interfaceProvider: () => [loopback],
    discoveryPort,
    targetsFor: () => ['127.0.0.1'],
    // Real replies come from a LAN address in the subnet; this test has loopback only.
    acceptSource: () => true,
    timing: FAST_TIMING,
    ...overrides,
  });
}

describe('LAN room finder against the real responder over loopback UDP', () => {
  it('finds a room that the responder holds and verifies the Host over HTTP', async () => {
    const gamePort = await startHealthServer();
    const { port } = await startResponder(gamePort, ['OTB-ABC234']);

    await expect(loopbackFinder(port).findRoom('otb-abc234')).resolves.toEqual({
      ok: true,
      endpoint: `http://127.0.0.1:${String(gamePort)}`,
    });
  });

  it('reports NOT_FOUND for a room the responder does not hold, without any reply', async () => {
    const gamePort = await startHealthServer();
    const { port } = await startResponder(gamePort, ['OTB-ABC234']);

    await expect(loopbackFinder(port).findRoom('OTB-NOPE22')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('reports UNREACHABLE when the responder answers but the game server does not', async () => {
    const closedPort = await startHealthServer();
    await cleanups.pop()?.();
    const { port } = await startResponder(closedPort, ['OTB-ABC234']);

    await expect(loopbackFinder(port).findRoom('OTB-ABC234')).resolves.toEqual({ ok: false, code: 'UNREACHABLE' });
  });

  it('does not trust a reply from a loopback address under the default source policy', async () => {
    const gamePort = await startHealthServer();
    const { port } = await startResponder(gamePort, ['OTB-ABC234']);
    const strict = new finder.LanFinder({
      interfaceProvider: () => [loopback],
      discoveryPort: port,
      targetsFor: () => ['127.0.0.1'],
      timing: FAST_TIMING,
    });

    await expect(strict.findRoom('OTB-ABC234')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
