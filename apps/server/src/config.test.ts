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

    expect(config.database).toMatchObject({
      connectionString: 'postgresql://example.invalid/monopoly',
      ssl: false,
      rejectUnauthorized: true,
      maxConnections: 10,
    });
    expect(config.persistenceTiming).toEqual({
      reconnectGraceMs: 60_000,
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
});
