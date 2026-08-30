import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  findAvailableLoopbackPort,
  ManagedPostgresController,
  type ManagedPostgresCommandResult,
  type ManagedPostgresCommandRunner,
  resolveManagedPostgresPaths,
  resolvePostgresExecutables,
} from '../src/managedPostgres';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createLifecycleController(
  failure: 'start' | 'readiness',
): Promise<{
  controller: ManagedPostgresController;
  commands: Array<{ name: string; args: string[] }>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'monopoly-managed-postgres-'));
  temporaryRoots.push(root);
  const bin = path.join(root, 'bin');
  await mkdir(bin, { recursive: true });
  const extension = process.platform === 'win32' ? '.exe' : '';
  for (const executable of ['initdb', 'postgres', 'pg_ctl', 'pg_isready', 'createdb', 'psql']) {
    await writeFile(path.join(bin, executable + extension), '');
  }

  const commands: Array<{ name: string; args: string[] }> = [];
  const paths = resolveManagedPostgresPaths({
    proofDataDirectory: path.join(root, 'proof'),
  });
  const commandRunner: ManagedPostgresCommandRunner = async (filePath, args) => {
    const name = path.basename(filePath);
    commands.push({ name, args });
    if (name.startsWith('initdb')) {
      await mkdir(paths.dataDirectory, { recursive: true });
      await writeFile(path.join(paths.dataDirectory, 'PG_VERSION'), '17\n');
      return { code: 0, stdout: '', stderr: '' };
    }
    if (name.startsWith('pg_ctl') && args.at(-1) === 'start') {
      if (failure === 'start') {
        return { code: 1, stdout: '', stderr: 'ambiguous start failure' };
      }
      return { code: 0, stdout: '', stderr: '' };
    }
    if (name.startsWith('pg_isready') && failure === 'readiness') {
      throw new Error('readiness probe failed');
    }
    if (name.startsWith('pg_ctl') && args.at(-1) === 'stop') {
      return { code: 0, stdout: '', stderr: '' };
    }
    if (name.startsWith('pg_ctl') && args.at(-1) === 'status') {
      return { code: 3, stdout: '', stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' } satisfies ManagedPostgresCommandResult;
  };
  const controller = new ManagedPostgresController({
    resourceRoot: root,
    proofDataDirectory: paths.rootDirectory,
    port: await findAvailableLoopbackPort(),
    startupTimeoutMs: 50,
    shutdownTimeoutMs: 50,
    commandRunner,
  });
  return { controller, commands };
}

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

  it('cleans up after an ambiguous pg_ctl start failure', async () => {
    const { controller, commands } = await createLifecycleController('start');

    await expect(controller.start()).rejects.toThrow('ambiguous start failure');

    expect(controller.state).toBe('FAILED');
    expect(commands.filter(command => command.name.startsWith('pg_ctl')
      && command.args.at(-1) === 'stop')).toHaveLength(1);
    expect(commands.filter(command => command.name.startsWith('pg_ctl')
      && command.args.at(-1) === 'status')).toHaveLength(1);
  });

  it('cleans up after a failure following reported start success', async () => {
    const { controller, commands } = await createLifecycleController('readiness');

    await expect(controller.start()).rejects.toThrow('readiness probe failed');

    expect(controller.state).toBe('FAILED');
    expect(commands.filter(command => command.name.startsWith('pg_ctl')
      && command.args.at(-1) === 'start')).toHaveLength(1);
    expect(commands.filter(command => command.name.startsWith('pg_ctl')
      && command.args.at(-1) === 'stop')).toHaveLength(1);
    expect(commands.filter(command => command.name.startsWith('pg_ctl')
      && command.args.at(-1) === 'status')).toHaveLength(1);
  });
});
