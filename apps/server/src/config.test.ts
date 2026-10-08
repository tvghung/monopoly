import { describe, expect, it } from 'vitest';

import { loadServerConfig } from './config.js';

describe('loadServerConfig', () => {
  it('starts production configuration without a database', () => {
    expect(loadServerConfig({ NODE_ENV: 'production' }).runtimeProfile).toBe('development');
  });

  it('loads the documented persistence defaults', () => {
    const config = loadServerConfig({
      NODE_ENV: 'test',
    });

    expect(config.runtimeProfile).toBe('development');
    expect(config.listenHost).toBe('127.0.0.1');

    expect(config.persistenceTiming).toEqual({
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
    });
  });

  it('rejects invalid numeric configuration', () => {
    expect(() => loadServerConfig({ PORT: '0' })).toThrow(
      'PORT must be an integer between 1 and 65535',
    );
  });

  it('uses loopback by default and requires an explicit desktop profile', () => {
    expect(loadServerConfig({
      NODE_ENV: 'production',
    }).listenHost).toBe('127.0.0.1');
    expect(loadServerConfig({
      NODE_ENV: 'production',
      SERVER_RUNTIME_PROFILE: 'desktop',
    })).toMatchObject({
      runtimeProfile: 'desktop',
      listenHost: '127.0.0.1',
    });
    expect(loadServerConfig({
      NODE_ENV: 'production',
      SERVER_RUNTIME_PROFILE: 'desktop',
      PORT: '0',
    }).port).toBe(0);
  });

  it('rejects invalid runtime profile and empty host configuration', () => {
    expect(() => loadServerConfig({ SERVER_RUNTIME_PROFILE: 'lan' })).toThrow(
      'SERVER_RUNTIME_PROFILE must be development or desktop',
    );
    expect(() => loadServerConfig({ SERVER_HOST: ' ' })).toThrow(
      'SERVER_HOST must not be empty',
    );
  });
});
