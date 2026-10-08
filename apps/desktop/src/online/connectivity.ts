import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import integrity from '../../cloudflared-integrity.json';

export interface ConnectivityProvider {
  start(localEndpoint: string, onLost: () => void): Promise<string>;
  stop(): Promise<void>;
}

// `api.trycloudflare.com` is Cloudflare's own service host, which cloudflared names in error lines; it is never a tunnel.
const HOSTNAME = /^(?!api\.)[a-z0-9-]+\.trycloudflare\.com$/;
export function quickTunnelEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && HOSTNAME.test(url.hostname)
      && !url.port && !url.username && !url.password && url.pathname === '/'
      && !url.search && !url.hash ? url.origin : undefined;
  } catch { return undefined; }
}

export interface PinnedCloudflaredAssets {
  [target: string]: { executableSha256: string } | undefined;
}

/**
 * The only cloudflared this app starts is the executable whose SHA-256 is pinned in the
 * repository manifest for this platform. A checksum stored next to the file is ignored:
 * whoever can replace the executable can replace its neighbour.
 */
export function resolveCloudflared(
  configured: string | undefined,
  assets: PinnedCloudflaredAssets = integrity.assets,
  target = `${process.platform}-${process.arch}`,
  platform: NodeJS.Platform = process.platform,
): string {
  const expected = assets[target]?.executableSha256;
  if (!expected) throw new Error('CLOUDFLARED_MISSING');
  const basename = platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  if (!configured || !path.isAbsolute(configured) || path.basename(configured).toLowerCase() !== basename) {
    throw new Error('CLOUDFLARED_MISSING');
  }
  let resolved: string;
  try {
    resolved = realpathSync(configured);
    if (!existsSync(resolved)) throw new Error('missing');
  } catch {
    throw new Error('CLOUDFLARED_MISSING');
  }
  const actual = createHash('sha256').update(readFileSync(resolved)).digest('hex');
  if (actual !== expected) throw new Error('CLOUDFLARED_CORRUPT');
  return resolved;
}

/**
 * cloudflared reads user and system configuration (~/.cloudflared, ~/.cloudflare-warp, /etc/cloudflared,
 * /usr/local/etc/cloudflared) and a TUNNEL_* variable for almost every flag. A `name:` entry or TUNNEL_NAME
 * makes `cloudflared tunnel --url` look for a login certificate and exit before it prints a URL (reproduced
 * with cloudflared 2026.9.3), so a Quick Tunnel gets its own empty configuration file and none of those variables.
 */
const CLOUDFLARED_ENVIRONMENT = /^(?:TUNNEL_.*|NO_AUTOUPDATE|NO_TLS_VERIFY)$/iu;

export function quickTunnelEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(base).filter(([name]) => !CLOUDFLARED_ENVIRONMENT.test(name)));
}

export function quickTunnelArguments(configFile: string, origin: string): string[] {
  return ['tunnel', '--no-autoupdate', '--config', configFile, '--url', origin];
}

function removeDirectory(directory: string | undefined): void {
  if (!directory) return;
  try { rmSync(directory, { recursive: true, force: true }); } catch { /* A temp directory is not worth failing a stop. */ }
}

export class CloudflareQuickTunnel implements ConnectivityProvider {
  private child: ChildProcess | undefined;
  private runtimeDirectory: string | undefined;
  private starting: Promise<string> | undefined;
  private stopping = false;

  constructor(
    private readonly executable?: string,
    private readonly spawnProcess: typeof spawn = spawn,
    private readonly resolveExecutable: (configured?: string) => string = (configured) => resolveCloudflared(configured),
    private readonly baseEnvironment: NodeJS.ProcessEnv = process.env,
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
    const runtimeDirectory = mkdtempSync(path.join(tmpdir(), 'otb-cloudflared-'));
    const configFile = path.join(runtimeDirectory, 'config.yml');
    writeFileSync(configFile, '# Own the Block runs Cloudflare Quick Tunnels only; other cloudflared configuration is ignored.\n');
    this.runtimeDirectory = runtimeDirectory;
    this.starting = new Promise<string>((resolve, reject) => {
      const child = this.spawnProcess(binary, quickTunnelArguments(configFile, local.origin), {
        shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: quickTunnelEnvironment(this.baseEnvironment),
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
        // The hostname must end where the URL ends: `room.trycloudflare.com.evil.test` is not `room.trycloudflare.com`.
        const match = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com(?![a-z0-9.-])\/?/i);
        const endpoint = match && quickTunnelEndpoint(match[0]);
        if (endpoint) finish(undefined, endpoint);
      };
      child.stdout?.on('data', parse);
      child.stderr?.on('data', parse);
      child.once('error', () => finish(new Error('TUNNEL_START_FAILED')));
      child.once('exit', () => {
        // Each run owns its directory and its exit: a late exit of an earlier process must not remove the
        // directory of, or report a loss for, the tunnel that replaced it.
        removeDirectory(runtimeDirectory);
        const current = this.child === child;
        if (current) this.child = undefined;
        if (!settled) finish(new Error('TUNNEL_START_FAILED'));
        else if (current && !this.stopping) onLost();
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
    const runtimeDirectory = this.runtimeDirectory;
    this.child = undefined;
    this.runtimeDirectory = undefined;
    if (child) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 2_000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill();
      });
    }
    removeDirectory(runtimeDirectory);
  }
}
