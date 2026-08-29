import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const POSTGRES_MAJOR = '17';
const DATABASE_NAME = 'own_the_block';
const DATABASE_USER = 'postgres';
const LOOPBACK_HOST = '127.0.0.1';
const COMMAND_OUTPUT_LIMIT = 2_048;

export type ManagedPostgresState =
  | 'STOPPED'
  | 'INITIALIZING'
  | 'STARTING'
  | 'READY'
  | 'STOPPING'
  | 'FAILED';

export interface ManagedPostgresPaths {
  rootDirectory: string;
  dataDirectory: string;
  runtimeDirectory: string;
  credentialsDirectory: string;
  passwordFile: string;
  logDirectory: string;
  logFile: string;
  portFile: string;
}

export interface ManagedPostgresInfo {
  dataDirectory: string;
  resourceRoot: string;
  port: number;
  databaseUrl: string;
  pid: number | undefined;
}

export interface ManagedPostgresOptions {
  resourceRoot: string;
  userDataPath?: string;
  proofDataDirectory?: string;
  port?: number;
  platform?: NodeJS.Platform;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}

export interface PostgresExecutables {
  initdb: string;
  postgres: string;
  pgCtl: string;
  pgIsReady: string;
  createdb: string;
  psql: string;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function boundedOutput(value: string): string {
  return value.slice(-COMMAND_OUTPUT_LIMIT);
}

function commandError(filePath: string, result: CommandResult): Error {
  const output = boundedOutput(`${result.stdout}\n${result.stderr}`.trim());
  return new Error(
    `${path.basename(filePath)} exited with code ${String(result.code)}${output ? `: ${output}` : ''}`,
  );
}

function runCommand(
  filePath: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; timeoutMs: number; cwd?: string },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(filePath, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      child.stdout?.destroy();
      child.stderr?.destroy();
      reject(new Error(`${path.basename(filePath)} timed out`));
    }, options.timeoutMs);
    child.stdout?.on('data', chunk => {
      stdout = boundedOutput(`${stdout}${String(chunk)}`);
    });
    child.stderr?.on('data', chunk => {
      stderr = boundedOutput(`${stderr}${String(chunk)}`);
    });
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', code => {
      clearTimeout(timer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function assertAbsolute(name: string, value: string): void {
  if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`);
}

export function resolvePostgresExecutables(
  resourceRoot: string,
  platform: NodeJS.Platform = process.platform,
): PostgresExecutables {
  assertAbsolute('PostgreSQL resource root', resourceRoot);
  const extension = platform === 'win32' ? '.exe' : '';
  const bin = path.join(resourceRoot, 'bin');
  return {
    initdb: path.join(bin, `initdb${extension}`),
    postgres: path.join(bin, `postgres${extension}`),
    pgCtl: path.join(bin, `pg_ctl${extension}`),
    pgIsReady: path.join(bin, `pg_isready${extension}`),
    createdb: path.join(bin, `createdb${extension}`),
    psql: path.join(bin, `psql${extension}`),
  };
}

export function resolveManagedPostgresPaths({
  userDataPath,
  proofDataDirectory,
}: Pick<ManagedPostgresOptions, 'userDataPath' | 'proofDataDirectory'>): ManagedPostgresPaths {
  const rootDirectory = proofDataDirectory
    ?? (userDataPath ? path.join(userDataPath, 'host-runtime', 'postgres-17') : undefined);
  if (!rootDirectory) {
    throw new Error('Managed PostgreSQL requires userDataPath or proofDataDirectory');
  }
  assertAbsolute('Managed PostgreSQL data root', rootDirectory);
  const dataDirectory = path.join(rootDirectory, 'data');
  return {
    rootDirectory,
    dataDirectory,
    runtimeDirectory: path.join(rootDirectory, 'runtime'),
    credentialsDirectory: path.join(rootDirectory, 'credentials'),
    passwordFile: path.join(rootDirectory, 'credentials', 'postgres-password'),
    logDirectory: path.join(rootDirectory, 'logs'),
    logFile: path.join(rootDirectory, 'logs', 'postgres.log'),
    portFile: path.join(rootDirectory, 'runtime', 'port'),
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function findAvailablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK_HOST, () => resolve());
  });
  const address = server.address();
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (!address || typeof address === 'string') throw new Error('Could not select a loopback port');
  return address.port;
}

export const findAvailableLoopbackPort = findAvailablePort;

async function assertPortAvailable(port: number): Promise<void> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, () => resolve());
  }).finally(() => new Promise<void>(resolve => server.close(() => resolve())));
}

function validatePort(port: number): number {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Managed PostgreSQL port must be between 1 and 65535');
  }
  return port;
}

async function readStoredPort(portFile: string): Promise<number | undefined> {
  try {
    const port = Number((await readFile(portFile, 'utf8')).trim());
    return Number.isSafeInteger(port) && port >= 1 && port <= 65_535 ? port : undefined;
  } catch {
    return undefined;
  }
}

function databaseUrl(password: string, port: number): string {
  return `postgresql://${DATABASE_USER}:${encodeURIComponent(password)}@${LOOPBACK_HOST}:${String(port)}/${DATABASE_NAME}`;
}

export class ManagedPostgresController {
  private currentState: ManagedPostgresState = 'STOPPED';

  private currentInfo: ManagedPostgresInfo | undefined;

  private startPromise: Promise<ManagedPostgresInfo> | undefined;

  private stopPromise: Promise<void> | undefined;

  private readonly paths: ManagedPostgresPaths;

  private readonly executables: PostgresExecutables;

  private readonly startupTimeoutMs: number;

  private readonly shutdownTimeoutMs: number;

  public constructor(private readonly options: ManagedPostgresOptions) {
    this.paths = resolveManagedPostgresPaths(options);
    this.executables = resolvePostgresExecutables(
      options.resourceRoot,
      options.platform ?? process.platform,
    );
    this.startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000;
  }

  public get state(): ManagedPostgresState {
    return this.currentState;
  }

  public get managedPaths(): ManagedPostgresPaths {
    return this.paths;
  }

  public async start(): Promise<ManagedPostgresInfo> {
    if (this.currentState === 'READY' && this.currentInfo) return this.currentInfo;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  public async stop(): Promise<void> {
    if (this.currentState === 'STOPPED') return;
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.stopInternal().finally(() => {
      this.stopPromise = undefined;
    });
    return this.stopPromise;
  }

  private async startInternal(): Promise<ManagedPostgresInfo> {
    this.currentState = 'INITIALIZING';
    let serverStarted = false;
    try {
      await Promise.all([
        access(this.executables.initdb),
        access(this.executables.postgres),
        access(this.executables.pgCtl),
        access(this.executables.pgIsReady),
        access(this.executables.createdb),
        access(this.executables.psql),
      ]);
      await mkdir(this.paths.credentialsDirectory, { recursive: true });
      await mkdir(this.paths.runtimeDirectory, { recursive: true });
      await mkdir(this.paths.logDirectory, { recursive: true });
      const password = await this.ensurePassword();
      const existingCluster = await this.inspectDataDirectory();
      if (!existingCluster) {
        const initResult = await runCommand(this.executables.initdb, [
          '-D', this.paths.dataDirectory,
          '-U', DATABASE_USER,
          '--encoding=UTF8',
          '--locale=C',
          '--auth-host=scram-sha-256',
          '--auth-local=scram-sha-256',
          '--pwfile', this.paths.passwordFile,
        ], { timeoutMs: this.startupTimeoutMs });
        if (initResult.code !== 0) throw commandError(this.executables.initdb, initResult);
      }

      const storedPort = await readStoredPort(this.paths.portFile);
      const requestedPort = this.options.port === undefined
        ? storedPort ?? await findAvailablePort()
        : validatePort(this.options.port);
      const port = validatePort(requestedPort);
      await assertPortAvailable(port);
      await this.writeLoopbackConfiguration(port);
      await writeFile(this.paths.portFile, `${String(port)}\n`, 'utf8');
      this.currentState = 'STARTING';

      const startResult = await runCommand(this.executables.pgCtl, [
        '-D', this.paths.dataDirectory,
        '-l', this.paths.logFile,
        '-o', `-p ${String(port)} -h ${LOOPBACK_HOST}`,
        '-w',
        '-t', String(Math.max(1, Math.ceil(this.startupTimeoutMs / 1_000))),
        'start',
      ], { timeoutMs: this.startupTimeoutMs + 2_000 });
      if (startResult.code !== 0) throw commandError(this.executables.pgCtl, startResult);
      serverStarted = true;

      await this.waitUntilReady(port);
      const environment = this.databaseEnvironment(password, port);
      const probe = await runCommand(this.executables.psql, [
        '-w', '-X', '-v', 'ON_ERROR_STOP=1',
        '-h', LOOPBACK_HOST, '-p', String(port), '-U', DATABASE_USER,
        '-d', 'postgres', '-tAc', 'SELECT 1',
      ], { env: environment, timeoutMs: this.startupTimeoutMs });
      if (probe.code !== 0) throw commandError(this.executables.psql, probe);
      const databaseExists = await runCommand(this.executables.psql, [
        '-w', '-X', '-v', 'ON_ERROR_STOP=1',
        '-h', LOOPBACK_HOST, '-p', String(port), '-U', DATABASE_USER,
        '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname = '${DATABASE_NAME}'`,
      ], { env: environment, timeoutMs: this.startupTimeoutMs });
      if (databaseExists.code !== 0) throw commandError(this.executables.psql, databaseExists);
      if (!databaseExists.stdout.includes('1')) {
        const created = await runCommand(this.executables.createdb, [
          '-w', '-h', LOOPBACK_HOST, '-p', String(port), '-U', DATABASE_USER, DATABASE_NAME,
        ], { env: environment, timeoutMs: this.startupTimeoutMs });
        if (created.code !== 0) throw commandError(this.executables.createdb, created);
      }

      this.currentInfo = {
        dataDirectory: this.paths.dataDirectory,
        resourceRoot: this.options.resourceRoot,
        port,
        databaseUrl: databaseUrl(password, port),
        pid: await this.readPostgresPid(),
      };
      this.currentState = 'READY';
      return this.currentInfo;
    } catch (error) {
      if (serverStarted) {
        await runCommand(this.executables.pgCtl, [
          '-D', this.paths.dataDirectory,
          '-m', 'fast',
          '-w',
          '-t', String(Math.max(1, Math.ceil(this.shutdownTimeoutMs / 1_000))),
          'stop',
        ], { timeoutMs: this.shutdownTimeoutMs + 2_000 }).catch(() => undefined);
      }
      this.currentState = 'FAILED';
      throw error;
    }
  }

  private async stopInternal(): Promise<void> {
    this.currentState = 'STOPPING';
    try {
      const result = await runCommand(this.executables.pgCtl, [
        '-D', this.paths.dataDirectory,
        '-m', 'fast',
        '-w',
        '-t', String(Math.max(1, Math.ceil(this.shutdownTimeoutMs / 1_000))),
        'stop',
      ], { timeoutMs: this.shutdownTimeoutMs + 2_000 });
      if (result.code !== 0) throw commandError(this.executables.pgCtl, result);
      this.currentInfo = undefined;
      this.currentState = 'STOPPED';
    } catch (error) {
      this.currentState = 'FAILED';
      throw error;
    }
  }

  private async ensurePassword(): Promise<string> {
    if (await pathExists(this.paths.passwordFile)) {
      const password = (await readFile(this.paths.passwordFile, 'utf8')).trim();
      if (!password) throw new Error('Managed PostgreSQL password file is empty');
      return password;
    }
    const entries = await readdir(this.paths.dataDirectory).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
    if (entries.length > 0) {
      throw new Error('Managed PostgreSQL cluster exists without its generated password file');
    }
    const password = randomBytes(32).toString('base64url');
    await writeFile(this.paths.passwordFile, `${password}\n`, { encoding: 'utf8', mode: 0o600 });
    await chmod(this.paths.passwordFile, 0o600).catch(() => undefined);
    return password;
  }

  private async inspectDataDirectory(): Promise<boolean> {
    const entries = await readdir(this.paths.dataDirectory).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
    const versionPath = path.join(this.paths.dataDirectory, 'PG_VERSION');
    if (await pathExists(versionPath)) {
      const version = (await readFile(versionPath, 'utf8')).trim();
      if (version.split('.')[0] !== POSTGRES_MAJOR) {
        throw new Error(`Managed PostgreSQL data directory requires major version ${POSTGRES_MAJOR}`);
      }
      return true;
    }
    if (entries.length > 0) {
      throw new Error('Managed PostgreSQL data directory is non-empty without PG_VERSION');
    }
    return false;
  }

  private async writeLoopbackConfiguration(port: number): Promise<void> {
    await writeFile(
      path.join(this.paths.dataDirectory, 'postgresql.auto.conf'),
      `listen_addresses = '127.0.0.1'\nport = ${String(port)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(this.paths.dataDirectory, 'pg_hba.conf'),
      [
        'local all all scram-sha-256',
        'host all all 127.0.0.1/32 scram-sha-256',
        'host all all ::1/128 scram-sha-256',
        '',
      ].join('\n'),
      'utf8',
    );
  }

  private databaseEnvironment(password: string, port: number): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PGPASSFILE: this.paths.passwordFile,
      PGHOST: LOOPBACK_HOST,
      PGPORT: String(port),
      PGUSER: DATABASE_USER,
      PGPASSWORD: password,
    };
  }

  private async waitUntilReady(port: number): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      const result = await runCommand(this.executables.pgIsReady, [
        '-h', LOOPBACK_HOST, '-p', String(port), '-t', '1',
      ], { timeoutMs: 2_000 });
      if (result.code === 0) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Managed PostgreSQL did not become ready before the startup deadline');
  }

  private async readPostgresPid(): Promise<number | undefined> {
    try {
      const pid = Number((await readFile(path.join(this.paths.dataDirectory, 'postmaster.pid'), 'utf8'))
        .split(/\r?\n/u)[0]);
      return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
    } catch {
      return undefined;
    }
  }
}
