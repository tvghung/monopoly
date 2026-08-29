import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolveManagedPostgresPaths,
  resolvePostgresExecutables,
} from '../src/managedPostgres';

describe('managed PostgreSQL resource paths', () => {
  it('keeps native binaries external and platform-specific', () => {
    const root = path.resolve('resources/postgres/win32-x64');
    expect(resolvePostgresExecutables(root, 'win32')).toMatchObject({
      initdb: path.join(root, 'bin', 'initdb.exe'),
      postgres: path.join(root, 'bin', 'postgres.exe'),
      pgCtl: path.join(root, 'bin', 'pg_ctl.exe'),
    });
    expect(resolvePostgresExecutables(root, 'darwin').initdb).toBe(
      path.join(root, 'bin', 'initdb'),
    );
  });

  it('uses an isolated proof root or app-data host-runtime root', () => {
    const proof = resolveManagedPostgresPaths({
      proofDataDirectory: path.resolve('proof-root'),
    });
    expect(proof.dataDirectory).toBe(path.join(proof.rootDirectory, 'data'));
    expect(resolveManagedPostgresPaths({ userDataPath: path.resolve('user-data') }).rootDirectory)
      .toBe(path.resolve('user-data', 'host-runtime', 'postgres-17'));
  });
});
