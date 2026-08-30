import { describe, expect, it } from 'vitest';

import { loadServerConfig } from './config.js';

describe('loadServerConfig', () => {
  it('requires PostgreSQL in production', () => {
    expect(() => loadServerConfig({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL is required',
    );
  });

  it('loads the documented persistence defaults', () => {
    const config = loadServerConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://example.invalid/monopoly',
    });

    expect(config.runtimeProfile).toBe('development');
    expect(config.listenHost).toBe('127.0.0.1');

    expect(config.database).toMatchObject({
      connectionString: 'postgresql://example.invalid/monopoly',
      ssl: false,
      rejectUnauthorized: true,
      maxConnections: 10,
    });
    expect(config.persistenceTiming).toEqual({
      reconnectGraceMs: 60_000,
      paymentShortfallActionTimeoutMs: 120_000,
      cardAwaitingDrawTimeoutMs: 20_000,
      cardRevealedTimeoutMs: 30_000,
      pendingSessionTtlMs: 300_000,
      terminalSessionRetentionMs: 604_800_000,
      lobbyRetentionMs: 86_400_000,
      inProgressRetentionMs: 2_592_000_000,
      finishedRetentionMs: 604_800_000,
    });
  });

  it('rejects invalid numeric and boolean configuration', () => {
    expect(() => loadServerConfig({ PORT: '0' })).toThrow(
      'PORT must be a positive integer',
    );
    expect(() =>
      loadServerConfig({
        DATABASE_URL: 'postgresql://example.invalid/monopoly',
        DATABASE_SSL: 'yes',
      }),
    ).toThrow('DATABASE_SSL must be either true or false');
  });

  it('uses an explicit loopback desktop profile and a cloud bind by default', () => {
    expect(loadServerConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example.invalid/monopoly',
    }).listenHost).toBe('0.0.0.0');
    expect(loadServerConfig({
      NODE_ENV: 'production',
      SERVER_RUNTIME_PROFILE: 'desktop',
      DATABASE_URL: 'postgresql://example.invalid/monopoly',
    })).toMatchObject({
      runtimeProfile: 'desktop',
      listenHost: '127.0.0.1',
    });
  });

  it('rejects invalid runtime profile and empty host configuration', () => {
    expect(() => loadServerConfig({ SERVER_RUNTIME_PROFILE: 'lan' })).toThrow(
      'SERVER_RUNTIME_PROFILE must be development, cloud, or desktop',
    );
    expect(() => loadServerConfig({ SERVER_HOST: ' ' })).toThrow(
      'SERVER_HOST must not be empty',
    );
  });
});
