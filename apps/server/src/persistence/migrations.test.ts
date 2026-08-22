import { describe, expect, it } from 'vitest';

import { canonicalizeMigrationSql, loadMigrationFiles } from './migrate.js';

describe('database migrations', () => {
  it('loads ordered, checksummed SQL migrations', async () => {
    const migrations = await loadMigrationFiles();

    expect(migrations.map(({ version }) => version)).toEqual([
      '001_initial_persistence.sql',
      '002_trade_offer_bundles.sql',
      '003_reset_v1_snapshots.sql',
      '004_simplified_rules_v3.sql',
      '005_remove_mortgage_open_market.sql',
      '006_appearance_system_v5.sql',
      '007_roll_sequence_v6.sql',
      '008_semantic_card_v7.sql',
    ]);
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(migrations[0]?.sql).toContain('CREATE TABLE rooms');
    expect(migrations[0]?.sql).toContain('CREATE TABLE player_sessions');
    expect(migrations[0]?.sql).toContain('CREATE TABLE trade_offers');
    expect(migrations[0]?.sql).not.toContain('\r');
    expect(migrations[2]?.sql).toContain('snapshot_schema_version = 2');
    expect(migrations[2]?.sql).toContain('aggregate_version = aggregate_version + 1');
    expect(migrations[2]?.sql).not.toContain('DELETE FROM rooms');
    expect(migrations[3]?.sql).toContain('snapshot_schema_version = 3');
    expect(migrations[4]?.sql).toContain('snapshot_schema_version = 4');
    expect(migrations[4]?.sql).toContain("status = 'CANCELLED'");
    expect(migrations[4]?.sql).toContain("value - 'mortgaged'");
    expect(migrations[5]?.sql).toContain('snapshot_schema_version = 5');
    expect(migrations[5]?.sql).toContain("'characterId', NULL");
    expect(migrations[5]?.sql).toContain("WHEN 'white' THEN 'cyan'");
    expect(migrations[6]?.sql).toContain("'rollSequence', 0");
    expect(migrations[6]?.sql).toContain('snapshot_schema_version = 6');
    expect(migrations[6]?.sql).toContain('aggregate_version = aggregate_version + 1');
    expect(migrations[7]?.sql).toContain("'gameplayEvents'");
    expect(migrations[7]?.sql).toContain("'privateGameplayEventsByPlayer'");
    expect(migrations[7]?.sql).toContain("'completedCardOperations'");
    expect(migrations[7]?.sql).toContain('snapshot_schema_version = 7');
    expect(migrations[7]?.sql).toContain("- 'gameplayEvents'::TEXT");
    expect(migrations[7]?.sql).toContain('aggregate_version = aggregate_version + 1');
  });

  it('canonicalizes checkout line endings before hashing or executing SQL', () => {
    expect(canonicalizeMigrationSql('SELECT 1;\r\nSELECT 2;\r')).toBe(
      'SELECT 1;\nSELECT 2;\n',
    );
  });

  it('pins the checksum of the historical v3 migration', async () => {
    const migrations = await loadMigrationFiles();
    const migration = migrations.find(({ version }) => (
      version === '004_simplified_rules_v3.sql'
    ));

    // Migrations 001-004 are historical and applied databases record their
    // checksums; editing one can prevent an existing database from starting.
    // Keep this literal independent from the file under test so an accidental
    // edit cannot silently update the expected value.
    expect(migration?.checksum).toBe(
      '36e396735856d38b1257a42b9f15821c0752c73892e455a5add64c4e01b552cd',
    );
  });
});
