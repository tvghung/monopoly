import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool, type PoolClient } from 'pg';

import { loadServerConfig, type DatabaseConfig } from '../config.js';

const MIGRATION_LOCK_NAME = 'monopoly-websockets-schema-migrations';
function defaultMigrationsDirectory(): string {
  return typeof import.meta.url === 'string'
    ? fileURLToPath(new URL('../../migrations/', import.meta.url))
    : resolve(process.cwd(), 'migrations');
}

interface MigrationFile {
  version: string;
  sql: string;
  checksum: string;
}

interface AppliedMigrationRow {
  version: string;
  checksum: string;
}

export const canonicalizeMigrationSql = (sql: string): string => (
  sql.replace(/\r\n?/gu, '\n')
);

export function createMigrationPool(config: DatabaseConfig): Pool {
  return new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections,
    ssl: config.ssl
      ? { rejectUnauthorized: config.rejectUnauthorized }
      : undefined,
  });
}

export function resolveMigrationDirectory(
  directory?: string | URL,
): string {
  if (directory === undefined) return defaultMigrationsDirectory();
  return typeof directory === 'string' ? resolve(directory) : fileURLToPath(directory);
}

export async function loadMigrationFiles(
  directory?: string | URL,
): Promise<MigrationFile[]> {
  const migrationsDirectory = resolveMigrationDirectory(directory);
  const fileNames = (await readdir(migrationsDirectory))
    .filter((fileName) => /^\d+_[a-z0-9_]+\.sql$/u.test(fileName))
    .sort((left, right) => left.localeCompare(right));

  const migrations = await Promise.all(
    fileNames.map(async (fileName): Promise<MigrationFile> => {
      const sql = canonicalizeMigrationSql(
        await readFile(resolve(migrationsDirectory, fileName), 'utf8'),
      );
      return {
        version: fileName,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );

  if (new Set(migrations.map(({ version }) => version)).size !== migrations.length) {
    throw new Error('Duplicate database migration version');
  }
  return migrations;
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function readAppliedMigrations(
  client: PoolClient,
): Promise<Map<string, string>> {
  const result = await client.query<AppliedMigrationRow>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version',
  );
  return new Map(result.rows.map(({ version, checksum }) => [version, checksum]));
}

export async function migrateDatabase(
  pool: Pool,
  directory?: string | URL,
): Promise<string[]> {
  const migrations = await loadMigrationFiles(directory);
  const client = await pool.connect();
  const appliedNow: string[] = [];
  let lockAcquired = false;

  try {
    await ensureMigrationTable(client);
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [
      MIGRATION_LOCK_NAME,
    ]);
    lockAcquired = true;

    const applied = await readAppliedMigrations(client);
    for (const migration of migrations) {
      const recordedChecksum = applied.get(migration.version);
      if (recordedChecksum !== undefined) {
        if (recordedChecksum !== migration.checksum) {
          throw new Error(
            `Applied migration ${migration.version} has a different checksum`,
          );
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
          [migration.version, migration.checksum],
        );
        await client.query('COMMIT');
        appliedNow.push(migration.version);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try {
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
          MIGRATION_LOCK_NAME,
        ]);
      }
    } finally {
      client.release();
    }
  }

  return appliedNow;
}

export async function getMigrationStatus(
  pool: Pool,
  directory?: string | URL,
): Promise<Array<{ version: string; applied: boolean }>> {
  const migrations = await loadMigrationFiles(directory);
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const applied = await readAppliedMigrations(client);
    return migrations.map(({ version, checksum }) => {
      const recordedChecksum = applied.get(version);
      if (recordedChecksum !== undefined && recordedChecksum !== checksum) {
        throw new Error(`Applied migration ${version} has a different checksum`);
      }
      return { version, applied: recordedChecksum !== undefined };
    });
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const config = loadServerConfig(process.env, { requireDatabase: true });
  if (!config.database) throw new Error('DATABASE_URL is required');

  const pool = createMigrationPool(config.database);
  try {
    if (process.argv.includes('--status')) {
      const status = await getMigrationStatus(pool);
      for (const migration of status) {
        console.log(`${migration.applied ? 'applied' : 'pending'} ${migration.version}`);
      }
      return;
    }

    const applied = await migrateDatabase(pool);
    console.log(
      applied.length === 0
        ? 'Database schema is up to date'
        : `Applied migrations: ${applied.join(', ')}`,
    );
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  typeof import.meta.url === 'string' &&
  resolve(invokedPath) === fileURLToPath(import.meta.url)
) {
  void main().catch((error: unknown) => {
    console.error('Migration command failed', error);
    process.exitCode = 1;
  });
}
