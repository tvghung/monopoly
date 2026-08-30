import { utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';

const DIAGNOSTIC_LIMIT = 2_048;

export type ServerHelperState = 'STOPPED' | 'STARTING' | 'READY' | 'STOPPING' | 'FAILED';

export interface ServerHelperInfo {
  host: string;
  port: number;
  pid: number | undefined;
}

export interface ServerHelperOptions {
  modulePath: string;
  migrationDirectory: string;
  clientDist: string;
  databaseUrl: string;
  host: string;
  port: number;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  environment?: NodeJS.ProcessEnv;
  serviceName?: string;
  fork?: ServerHelperFork;
  fetch?: typeof globalThis.fetch;
}

export interface ServerHelperForkOptions {
  cwd: string;
  env: Record<string, string>;
  stdio: ['ignore', 'pipe', 'pipe'];
  serviceName: string;
}

export type ServerHelperFork = (
  modulePath: string,
  args: string[],
  options: ServerHelperForkOptions,
) => UtilityProcess;

function sanitizeDiagnostic(value: unknown, secret: string): string {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replaceAll(secret, '[redacted]')
    .replace(/postgres(?:ql)?(?:\+[^:]+)?:\/\/[^\s"'`]+/giu, 'postgresql://[redacted]')
    .slice(-DIAGNOSTIC_LIMIT);
}

function boundedAppend(current: string, value: unknown): string {
  return `${current}${String(value)}`.slice(-DIAGNOSTIC_LIMIT);
}

function assertAbsolute(name: string, value: string): void {
  if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`);
}

function asStringEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function isReadyMessage(value: unknown): value is { type: 'ready'; host: string; port: number } {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return message.type === 'ready'
    && typeof message.host === 'string'
    && typeof message.port === 'number';
}

function isFailedMessage(value: unknown): value is { type: 'failed'; message?: unknown } {
  return typeof value === 'object'
    && value !== null
    && (value as Record<string, unknown>).type === 'failed';
}

export class ServerHelperController {
  private currentState: ServerHelperState = 'STOPPED';

  private currentInfo: ServerHelperInfo | undefined;

  private child: UtilityProcess | undefined;

  private childExit: Promise<number> | undefined;

  private startPromise: Promise<ServerHelperInfo> | undefined;

  private stopPromise: Promise<void> | undefined;

  private diagnostics = '';

  private readonly unexpectedExitListeners = new Set<(diagnostic: string) => void>();

  private readonly startupTimeoutMs: number;

  private readonly shutdownTimeoutMs: number;

  private readonly fetchImplementation: typeof globalThis.fetch;

  public constructor(private readonly options: ServerHelperOptions) {
    assertAbsolute('Server helper module path', options.modulePath);
    assertAbsolute('Server helper migration directory', options.migrationDirectory);
    assertAbsolute('Server helper client distribution', options.clientDist);
    if (!options.databaseUrl.trim()) throw new Error('Server helper database URL is required');
    if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 65_535) {
      throw new Error('Server helper port must be between 0 and 65535');
    }
    this.startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000;
    this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public get state(): ServerHelperState {
    return this.currentState;
  }

  public get diagnostic(): string {
    return this.diagnostics;
  }

  public onUnexpectedExit(listener: (diagnostic: string) => void): () => void {
    this.unexpectedExitListeners.add(listener);
    return () => this.unexpectedExitListeners.delete(listener);
  }

  public async checkHealth(): Promise<void> {
    const port = this.currentInfo?.port;
    if (this.currentState !== 'READY' || port === undefined) {
      throw new Error('Server helper is not ready');
    }
    const [health, ready] = await Promise.all([
      this.fetchImplementation(`http://127.0.0.1:${String(port)}/healthz`, {
        signal: AbortSignal.timeout(1_000),
      }),
      this.fetchImplementation(`http://127.0.0.1:${String(port)}/readyz`, {
        signal: AbortSignal.timeout(1_000),
      }),
    ]);
    if (health.status !== 200 || (await health.text()) !== 'ok'
      || ready.status !== 200 || (await ready.text()) !== 'ready') {
      throw new Error('Server helper health or readiness endpoint is unavailable');
    }
  }

  public async start(): Promise<ServerHelperInfo> {
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

  private async startInternal(): Promise<ServerHelperInfo> {
    this.currentState = 'STARTING';
    this.diagnostics = '';
    const environment = asStringEnvironment({
      ...process.env,
      ...this.options.environment,
      DATABASE_URL: this.options.databaseUrl,
      OWN_THE_BLOCK_MIGRATIONS_DIR: this.options.migrationDirectory,
      OWN_THE_BLOCK_CLIENT_DIST: this.options.clientDist,
      SERVER_HOST: this.options.host,
      SERVER_RUNTIME_PROFILE: 'desktop',
      NODE_ENV: 'production',
      PORT: String(this.options.port),
    });
    const fork = this.options.fork ?? ((modulePath, args, forkOptions) => (
      utilityProcess.fork(modulePath, args, forkOptions)
    ));
    const child = fork(this.options.modulePath, [], {
      cwd: path.dirname(this.options.modulePath),
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      serviceName: this.options.serviceName ?? 'Own the Block server',
    });
    this.child = child;
    this.childExit = new Promise<number>(resolve => {
      child.once('exit', code => resolve(code));
    });
    child.stdout?.on('data', chunk => {
      this.diagnostics = boundedAppend(
        this.diagnostics,
        sanitizeDiagnostic(chunk, this.options.databaseUrl),
      );
    });
    child.stderr?.on('data', chunk => {
      this.diagnostics = boundedAppend(
        this.diagnostics,
        sanitizeDiagnostic(chunk, this.options.databaseUrl),
      );
    });
    child.on('exit', code => {
      const wasReady = this.currentState === 'READY';
      if (this.currentState !== 'STOPPING' && this.currentState !== 'STOPPED') {
        this.currentState = 'FAILED';
        this.diagnostics = boundedAppend(
          this.diagnostics,
          `Server helper exited with code ${String(code)}`,
        );
        if (wasReady) {
          for (const listener of this.unexpectedExitListeners) listener(this.diagnostics);
        }
      }
    });
    child.on('error', (type, location, report) => {
      const wasReady = this.currentState === 'READY';
      this.diagnostics = sanitizeDiagnostic(
        `${String(type)} ${String(location)} ${String(report)}`,
        this.options.databaseUrl,
      );
      if (this.currentState !== 'STOPPING') this.currentState = 'FAILED';
      if (wasReady) {
        for (const listener of this.unexpectedExitListeners) listener(this.diagnostics);
      }
    });

    try {
      const readyMessage = await this.waitForReadyMessage(child);
      await this.waitForHttpReadiness(readyMessage.port);
      this.currentInfo = {
        ...readyMessage,
        pid: child.pid,
      };
      this.currentState = 'READY';
      return this.currentInfo;
    } catch (error) {
      this.currentState = 'FAILED';
      let cleanupError: unknown;
      try {
        await this.terminateAfterFailure(child);
      } catch (terminationError) {
        cleanupError = terminationError;
      }
      throw this.failureError(error, cleanupError);
    }
  }

  private waitForReadyMessage(
    child: UtilityProcess,
  ): Promise<{ host: string; port: number }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Server helper readiness timed out${this.diagnostics ? `: ${this.diagnostics}` : ''}`));
      }, this.startupTimeoutMs);
      const handleMessage = (value: unknown): void => {
        if (isFailedMessage(value)) {
          clearTimeout(timer);
          const message = typeof value.message === 'string' ? value.message : 'Server helper failed';
          reject(new Error(message));
          return;
        }
        if (!isReadyMessage(value)) return;
        const validPort = Number.isSafeInteger(value.port) && value.port >= 1 && value.port <= 65_535;
        if (value.host !== this.options.host || !validPort
          || this.options.port !== 0 && value.port !== this.options.port) {
          clearTimeout(timer);
          reject(new Error('Server helper announced an unexpected endpoint'));
          return;
        }
        clearTimeout(timer);
        resolve({ host: value.host, port: value.port });
      };
      child.once('message', handleMessage);
      child.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`Server helper exited before readiness with code ${String(code)}`));
      });
    });
  }

  private async waitForHttpReadiness(port: number): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const health = await this.fetchImplementation(
          `http://127.0.0.1:${String(port)}/healthz`,
          { signal: AbortSignal.timeout(1_000) },
        );
        const ready = await this.fetchImplementation(
          `http://127.0.0.1:${String(port)}/readyz`,
          { signal: AbortSignal.timeout(1_000) },
        );
        if (health.status === 200 && (await health.text()) === 'ok'
          && ready.status === 200 && (await ready.text()) === 'ready') return;
        lastError = new Error('Server helper health or readiness endpoint was not ready');
      } catch (error) {
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(
      `Server helper HTTP readiness timed out${lastError ? `: ${sanitizeDiagnostic(lastError, this.options.databaseUrl)}` : ''}`,
    );
  }

  private async stopInternal(): Promise<void> {
    const child = this.child;
    if (!child) {
      this.currentInfo = undefined;
      this.currentState = 'STOPPED';
      return;
    }
    this.currentState = 'STOPPING';
    try {
      child.postMessage({ type: 'shutdown' });
      await this.waitForExit(this.childExit ?? Promise.resolve(0));
      this.currentInfo = undefined;
      this.child = undefined;
      this.childExit = undefined;
      this.currentState = 'STOPPED';
    } catch (error) {
      let cleanupError: unknown;
      try {
        await this.terminateAfterFailure(child);
      } catch (terminationError) {
        cleanupError = terminationError;
      }
      this.currentState = 'FAILED';
      throw this.failureError(error, cleanupError);
    }
  }

  private async terminateAfterFailure(child: UtilityProcess): Promise<void> {
    const exitPromise = this.childExit ?? Promise.resolve(0);
    child.kill();
    await this.waitForExit(exitPromise, false);
    if (this.child === child) {
      this.currentInfo = undefined;
      this.child = undefined;
      this.childExit = undefined;
    }
  }

  private failureError(error: unknown, cleanupError?: unknown): Error {
    const primary = sanitizeDiagnostic(error, this.options.databaseUrl);
    const cleanup = cleanupError
      ? sanitizeDiagnostic(cleanupError, this.options.databaseUrl)
      : '';
    return new Error(
      cleanup ? primary + '; helper cleanup failed: ' + cleanup : primary,
      { cause: new Error(primary) },
    );
  }

  private async waitForExit(
    exitPromise: Promise<number>,
    requireCleanExit = true,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        exitPromise.then(code => {
          if (requireCleanExit && code !== 0) {
            throw new Error(`Server helper exited with code ${String(code)}`);
          }
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Server helper shutdown timed out')), this.shutdownTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
