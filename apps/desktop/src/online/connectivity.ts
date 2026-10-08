import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

export interface ConnectivityProvider {
  start(localEndpoint: string, onLost: () => void): Promise<string>;
  stop(): Promise<void>;
}

const HOSTNAME = /^[a-z0-9-]+\.trycloudflare\.com$/;
export function quickTunnelEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && HOSTNAME.test(url.hostname)
      && !url.port && !url.username && !url.password && url.pathname === '/'
      && !url.search && !url.hash ? url.origin : undefined;
  } catch { return undefined; }
}

function cloudflaredPath(configured?: string): string {
  const basename = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const candidates = configured
    ? [configured]
    : (process.env.PATH || '').split(path.delimiter).map(directory => path.join(directory, basename));
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate) || path.basename(candidate).toLowerCase() !== basename) continue;
    try {
      const resolved = realpathSync(candidate);
      if (existsSync(resolved)) return resolved;
    } catch { /* Try the next PATH entry. */ }
  }
  throw new Error('CLOUDFLARED_MISSING');
}

export class CloudflareQuickTunnel implements ConnectivityProvider {
  private child: ChildProcess | undefined;
  private starting: Promise<string> | undefined;
  private stopping = false;

  constructor(
    private readonly executable?: string,
    private readonly spawnProcess: typeof spawn = spawn,
    private readonly resolveExecutable: (configured?: string) => string = cloudflaredPath,
  ) {}

  async start(localEndpoint: string, onLost: () => void): Promise<string> {
    if (this.starting) return this.starting;
    if (this.child) throw new Error('TUNNEL_ALREADY_RUNNING');
    const local = new URL(localEndpoint);
    if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || !local.port || local.pathname !== '/') {
      throw new Error('TUNNEL_ORIGIN_INVALID');
    }
    const binary = this.resolveExecutable(this.executable);
    this.stopping = false;
    this.starting = new Promise<string>((resolve, reject) => {
      const child = this.spawnProcess(binary, ['tunnel', '--no-autoupdate', '--url', local.origin], {
        shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      let settled = false;
      let tail = '';
      const finish = (error?: Error, endpoint?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(endpoint as string);
      };
      const parse = (chunk: Buffer): void => {
        // cloudflared prints its generated URL on stderr. Never forward process
        // output to the renderer or application logs.
        tail = (tail + chunk.toString('utf8')).slice(-4096);
        const match = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\/?/i);
        const endpoint = match && quickTunnelEndpoint(match[0]);
        if (endpoint) finish(undefined, endpoint);
      };
      child.stdout?.on('data', parse);
      child.stderr?.on('data', parse);
      child.once('error', () => finish(new Error('TUNNEL_START_FAILED')));
      child.once('exit', () => {
        this.child = undefined;
        if (!settled) finish(new Error('TUNNEL_START_FAILED'));
        else if (!this.stopping) onLost();
      });
      const timer = setTimeout(() => finish(new Error('TUNNEL_START_TIMEOUT')), 25_000);
    }).catch(async error => {
      await this.stop();
      throw error;
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 2_000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill();
    });
  }
}
