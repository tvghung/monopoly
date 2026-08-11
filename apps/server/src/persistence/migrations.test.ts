import { describe, expect, it } from 'vitest';

import { canonicalizeMigrationSql, loadMigrationFiles } from './migrate.js';

describe('database migrations', () => {
  it('loads ordered, checksummed SQL migrations', async () => {
    const migrations = await loadMigrationFiles();

    expect(migrations.map(({ version }) => version)).toEqual([
      '001_initial_persistence.sql',
    ]);
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(migrations[0]?.sql).toContain('CREATE TABLE rooms');
    expect(migrations[0]?.sql).toContain('CREATE TABLE player_sessions');
    expect(migrations[0]?.sql).toContain('CREATE TABLE trade_offers');
    expect(migrations[0]?.sql).not.toContain('\r');
  });

  it('canonicalizes checkout line endings before hashing or executing SQL', () => {
    expect(canonicalizeMigrationSql('SELECT 1;\r\nSELECT 2;\r')).toBe(
      'SELECT 1;\nSELECT 2;\n',
    );
  });
});
