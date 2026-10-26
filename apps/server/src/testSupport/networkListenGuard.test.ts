import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { Server, type AddressInfo } from 'node:net';
import { createSocket } from 'node:dgram';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { listenLoopbackTestServer } from './safeTestListener.js';

const require = createRequire(import.meta.url);
const guard = require('./networkListenGuard.cjs') as {
  assertLoopbackTestHost(host: unknown): asserts host is '127.0.0.1' | '::1';
};
const guardPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'networkListenGuard.cjs');

describe('server test network listener guard', () => {
  it('accepts only explicit IPv4 and IPv6 loopback addresses', () => {
    expect(guard.assertLoopbackTestHost('127.0.0.1')).toBeUndefined();
    expect(guard.assertLoopbackTestHost('::1')).toBeUndefined();
  });

  it.each([
    undefined,
    '',
    '0.0.0.0',
    '::',
    '192.168.1.44',
    '10.0.0.8',
    '203.0.113.9',
    'localhost',
    'attacker.example',
    '127.0.0.1%eth0',
  ])('rejects unsafe or implicit host %s', (host) => {
    expect(() => guard.assertLoopbackTestHost(host)).toThrowError(
      expect.objectContaining({ code: 'OTB_TEST_UNSAFE_NETWORK_LISTENER' }),
    );
  });

  it.each([
    undefined,
    '0.0.0.0',
    '::',
    '192.168.1.44',
    '203.0.113.9',
    'attacker.example',
  ])('rejects TCP host %s before opening a socket', (host) => {
    const server = new Server();
    const listen = host === undefined
      ? () => server.listen(0)
      : () => server.listen(0, host);
    expect(listen).toThrowError(
      expect.objectContaining({ code: 'OTB_TEST_UNSAFE_NETWORK_LISTENER' }),
    );
    expect(server.listening).toBe(false);
  });

  it('rejects unsafe UDP listeners before opening a socket', () => {
    const datagram = createSocket('udp4');
    expect(() => datagram.bind(0, '192.168.1.44')).toThrowError(
      expect.objectContaining({ code: 'OTB_TEST_UNSAFE_NETWORK_LISTENER' }),
    );
  });

  it('rejects unsafe hosts through the test fixture before opening a socket', () => {
    const server = new Server();
    expect(() => listenLoopbackTestServer(server, 0, '192.168.1.44')).toThrowError(
      expect.objectContaining({ code: 'OTB_TEST_UNSAFE_NETWORK_LISTENER' }),
    );
    expect(server.listening).toBe(false);
  });

  it('shows the former live-interface fixture would request Wi-Fi without a guard, without opening a socket', () => {
    const source = [
      "const net = require('node:net');",
      "const networkInterfaces = () => ({ WiFi: [{ family: 'IPv4', internal: false, address: '192.168.1.44' }] });",
      "const address = Object.values(networkInterfaces()).flat().find(entry => entry.family === 'IPv4' && !entry.internal).address;",
      'let requestedHost;',
      'net.Server.prototype.listen = function (_port, host) { requestedHost = host; return this; };',
      'new net.Server().listen(0, address);',
      "process.stdout.write(JSON.stringify({ requestedHost, opened: false }));",
    ].join('');
    const unguardedEnvironment: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '' };
    delete unguardedEnvironment.OTB_TEST_NETWORK_GUARD;
    const child = spawnSync(process.execPath, ['-e', source], {
      encoding: 'utf8',
      env: unguardedEnvironment,
    });

    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({ requestedHost: '192.168.1.44', opened: false });
  });

  it('propagates the configured guard to child Node processes and rejects Wi-Fi before opening a socket', () => {
    const inheritedPreload = '--import=' + pathToFileURL(guardPath).href;
    expect(process.env.OTB_TEST_NETWORK_GUARD).toBe('loopback-only');
    expect(process.env.NODE_OPTIONS).toContain(inheritedPreload);
    const source = [
      "const net = require('node:net');",
      'const server = new net.Server();',
      'try { server.listen(0, "192.168.1.44"); process.stdout.write("unexpected"); }',
      'catch (error) { process.stdout.write(JSON.stringify({ code: error.code, opened: server.listening })); }',
    ].join('');
    const child = spawnSync(process.execPath, ['-e', source], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OTB_TEST_NETWORK_GUARD: 'loopback-only',
      },
    });

    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      code: 'OTB_TEST_UNSAFE_NETWORK_LISTENER',
      opened: false,
    });
  });

  it('fails child startup on malformed guard configuration before application code runs', () => {
    const child = spawnSync(process.execPath, ['-e', 'process.stdout.write("unexpected")'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: '--import=' + pathToFileURL(guardPath).href,
        OTB_TEST_NETWORK_GUARD: 'allow-lan',
      },
    });

    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain('Unsupported OTB_TEST_NETWORK_GUARD mode: allow-lan');
    expect(child.stdout).toBe('');
  });

  it('starts and closes repeated actual test listeners on explicit IPv4 loopback', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const server = new Server();
      await listenLoopbackTestServer(server, 0, '127.0.0.1');
      expect(server.listening).toBe(true);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      expect(server.listening).toBe(false);
    }
  });

  it('starts and closes on explicit IPv6 loopback when the local stack supports it', async ({ skip }) => {
    const server = new Server();
    try {
      await listenLoopbackTestServer(server, 0, '::1');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'ENETUNREACH', 'EPROTONOSUPPORT'].includes(code ?? '')) {
        skip('IPv6 loopback is unavailable on this machine.');
      }
      throw error;
    }
    expect((server.address() as AddressInfo).address).toBe('::1');
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
});
