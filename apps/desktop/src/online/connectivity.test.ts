import type { spawn, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import integrity from '../../cloudflared-integrity.json';
import {
  CloudflareQuickTunnel,
  type PinnedCloudflaredAssets,
  quickTunnelArguments,
  quickTunnelEndpoint,
  quickTunnelEnvironment,
  resolveCloudflared,
} from './connectivity';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const OFFICIAL = 'official cloudflared executable';
const TARGET = 'test-x64';
const PINS: PinnedCloudflaredAssets = { [TARGET]: { executableSha256: sha256(OFFICIAL) } };

describe('Quick Tunnel endpoint validation', () => {
  it('accepts only a root HTTPS trycloudflare hostname', () => {
    expect(quickTunnelEndpoint('https://room.trycloudflare.com/')).toBe('https://room.trycloudflare.com');
    expect(quickTunnelEndpoint('https://room.trycloudflare.com.evil.test/')).toBeUndefined();
    expect(quickTunnelEndpoint('http://room.trycloudflare.com/')).toBeUndefined();
    expect(quickTunnelEndpoint('https://user:pass@room.trycloudflare.com/')).toBeUndefined();
    expect(quickTunnelEndpoint('https://api.trycloudflare.com/')).toBeUndefined();
  });
});

describe('pinned cloudflared manifest', () => {
  it('pins an archive and an executable digest for every supported target', () => {
    expect(Object.keys(integrity.assets).sort()).toEqual(['darwin-arm64', 'darwin-x64', 'win32-x64']);
    for (const asset of Object.values(integrity.assets)) {
      expect(asset.archiveSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(asset.executableSha256).toMatch(/^[a-f0-9]{64}$/u);
    }
    // Windows ships the executable itself; macOS ships a .tgz, so its two digests differ.
    expect(integrity.assets['win32-x64'].archiveSha256).toBe(integrity.assets['win32-x64'].executableSha256);
    expect(integrity.assets['darwin-x64'].archiveSha256).not.toBe(integrity.assets['darwin-x64'].executableSha256);
    expect(integrity.assets['darwin-arm64'].archiveSha256).not.toBe(integrity.assets['darwin-arm64'].executableSha256);
    expect(integrity.version).toMatch(/^\d{4}\.\d+\.\d+$/u);
  });
});

describe('cloudflared executable verification', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
  });
  async function executable(content: string, name = 'cloudflared.exe'): Promise<{ directory: string; file: string }> {
    const directory = await mkdtemp(path.join(tmpdir(), 'otb-cloudflared-pin-'));
    directories.push(directory);
    const file = path.join(directory, name);
    await writeFile(file, content);
    return { directory, file };
  }
  const resolve = (file: string | undefined, assets: PinnedCloudflaredAssets = PINS) => resolveCloudflared(file, assets, TARGET, 'win32');

  it('accepts the executable whose digest is pinned', async () => {
    const { file } = await executable(OFFICIAL);
    expect(resolve(file)).toBe(realpathSync(file));
  });

  it('rejects a modified executable', async () => {
    const { file } = await executable('modified executable');
    expect(() => resolve(file)).toThrow('CLOUDFLARED_CORRUPT');
  });

  it('rejects a modified executable even when an adjacent checksum file was modified to match', async () => {
    const { directory, file } = await executable('attacker controlled executable');
    await writeFile(path.join(directory, 'cloudflared.sha256'), sha256('attacker controlled executable'));
    expect(() => resolve(file)).toThrow('CLOUDFLARED_CORRUPT');
  });

  it('does not need, read or trust an adjacent checksum file for the genuine executable', async () => {
    const { directory, file } = await executable(OFFICIAL);
    await writeFile(path.join(directory, 'cloudflared.sha256'), 'f'.repeat(64));
    expect(resolve(file)).toBe(realpathSync(file));
  });

  it('treats a missing file, a relative path and a foreign file name as missing, never as a PATH lookup', async () => {
    const { directory, file } = await executable(OFFICIAL, 'renamed.exe');
    expect(() => resolve(file)).toThrow('CLOUDFLARED_MISSING');
    expect(() => resolve(path.join(directory, 'cloudflared.exe'))).toThrow('CLOUDFLARED_MISSING');
    expect(() => resolve('cloudflared.exe')).toThrow('CLOUDFLARED_MISSING');
    expect(() => resolve(undefined)).toThrow('CLOUDFLARED_MISSING');
  });

  it('refuses a platform with no pinned digest, and an entry with no usable digest', async () => {
    const { file } = await executable(OFFICIAL);
    expect(() => resolveCloudflared(file, PINS, 'freebsd-x64', 'win32')).toThrow('CLOUDFLARED_MISSING');
    expect(() => resolve(file, { [TARGET]: { executableSha256: '' } })).toThrow('CLOUDFLARED_MISSING');
    expect(() => resolve(file, { [TARGET]: undefined })).toThrow('CLOUDFLARED_MISSING');
    expect(() => resolve(file, {})).toThrow('CLOUDFLARED_MISSING');
  });

  it('checks the file name per platform', async () => {
    const { file } = await executable(OFFICIAL, 'cloudflared');
    expect(resolveCloudflared(file, PINS, TARGET, 'darwin')).toBe(realpathSync(file));
    expect(() => resolveCloudflared(file, PINS, TARGET, 'win32')).toThrow('CLOUDFLARED_MISSING');
  });

  it('is what a tunnel start uses before it spawns anything', async () => {
    const { file } = await executable('modified executable');
    const spawnProcess = vi.fn();
    const tunnel = new CloudflareQuickTunnel(
      file,
      spawnProcess,
      (configured) => resolveCloudflared(configured, PINS, TARGET, 'win32'),
    );
    await expect(tunnel.start('http://127.0.0.1:53120', vi.fn())).rejects.toThrow('CLOUDFLARED_CORRUPT');
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('uses the repository manifest by default and fails closed on an unpinned platform or file', async () => {
    const { file } = await executable('unverified binary');
    const tunnel = new CloudflareQuickTunnel(file);
    await expect(tunnel.start('http://127.0.0.1:53120', vi.fn())).rejects.toThrow(/CLOUDFLARED_(?:CORRUPT|MISSING)/u);
  });
});

describe('Quick Tunnel launch isolation', () => {
  it('uses one explicit configuration file and no tunnel flag from the environment', () => {
    expect(quickTunnelArguments('C:\\tmp\\config.yml', 'http://127.0.0.1:53120')).toEqual([
      'tunnel', '--no-autoupdate', '--config', 'C:\\tmp\\config.yml', '--url', 'http://127.0.0.1:53120',
    ]);
    const cleaned = quickTunnelEnvironment({
      PATH: '/usr/bin',
      HOME: '/home/player',
      TUNNEL_NAME: 'my-tunnel',
      TUNNEL_HOSTNAME: 'legacy.example.com',
      tunnel_url: 'http://localhost:1',
      NO_AUTOUPDATE: 'false',
      NO_TLS_VERIFY: 'true',
      TUNNELING_TOOL: 'kept: not a cloudflared variable',
    });
    expect(cleaned).toEqual({ PATH: '/usr/bin', HOME: '/home/player', TUNNELING_TOOL: 'kept: not a cloudflared variable' });
  });
});

describe('Cloudflare Quick Tunnel process', () => {
  afterEach(() => { vi.useRealTimers(); });

  function fakeChild(autoExitOnKill = true) {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(), stderr: new EventEmitter(),
      kill: vi.fn(() => {
        if (autoExitOnKill) queueMicrotask(() => child.emit('exit', 0));
        return true;
      }),
    });
    return child;
  }
  type FakeChild = ReturnType<typeof fakeChild>;

  function fixture(options: { baseEnvironment?: NodeJS.ProcessEnv; children?: FakeChild[] } = {}) {
    const children = options.children ?? [fakeChild()];
    const calls: Array<{ binary: string; args: readonly string[]; options: SpawnOptions }> = [];
    const spawnProcess = vi.fn((binary: string, args: readonly string[], spawnOptions: SpawnOptions) => {
      calls.push({ binary, args, options: spawnOptions });
      const child = children[calls.length - 1] ?? fakeChild();
      return child as unknown as ReturnType<typeof spawn>;
    });
    const tunnel = new CloudflareQuickTunnel(
      undefined,
      spawnProcess as unknown as typeof spawn,
      () => 'C:\\tools\\cloudflared.exe',
      options.baseEnvironment ?? {},
    );
    return { children, calls, spawnProcess, tunnel };
  }
  const configOf = (args: readonly string[]): string => args[args.indexOf('--config') + 1];
  const announce = (child: FakeChild, host: string): void => {
    child.stderr.emit('data', Buffer.from(`Your quick Tunnel has been created! Visit it at https://${host}.trycloudflare.com`));
  };

  it('starts without a shell, reads the verified public URL, and stops the process', async () => {
    const { children, calls, tunnel } = fixture();
    const onLost = vi.fn();
    const starting = tunnel.start('http://127.0.0.1:53120', onLost);
    expect(calls[0]?.binary).toBe('C:\\tools\\cloudflared.exe');
    expect(calls[0]?.args.slice(0, 3)).toEqual(['tunnel', '--no-autoupdate', '--config']);
    expect(calls[0]?.args.slice(-2)).toEqual(['--url', 'http://127.0.0.1:53120']);
    expect(calls[0]?.options).toMatchObject({ shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    announce(children[0], 'room');
    await expect(starting).resolves.toBe('https://room.trycloudflare.com');
    await tunnel.stop();
    expect((children[0]).kill).toHaveBeenCalledOnce();
    expect(onLost).not.toHaveBeenCalled();
  });

  it('starts with no Cloudflare configuration anywhere: an empty private file and a clean environment', async () => {
    const { children, calls, tunnel } = fixture({ baseEnvironment: { PATH: '/bin' } });
    const starting = tunnel.start('http://127.0.0.1:53120', vi.fn());
    const config = configOf(calls[0]?.args ?? []);
    expect(path.basename(config)).toBe('config.yml');
    expect(path.basename(path.dirname(config))).toMatch(/^otb-cloudflared-/u);
    expect(readFileSync(config, 'utf8').split(/\r?\n/u).filter(line => line && !line.startsWith('#'))).toEqual([]);
    expect(calls[0]?.options.env).toEqual({ PATH: '/bin' });
    announce(children[0], 'room');
    await starting;
    await tunnel.stop();
  });

  it('ignores an existing unrelated Cloudflare configuration and TUNNEL_* variables of the user', async () => {
    const { children, calls, tunnel } = fixture({
      baseEnvironment: {
        PATH: '/bin', HOME: '/home/player', USERPROFILE: 'C:\\Users\\player',
        TUNNEL_NAME: 'my-own-tunnel', TUNNEL_TOKEN: 'secret-token', TUNNEL_URL: 'http://localhost:9', NO_AUTOUPDATE: 'false',
      },
    });
    const starting = tunnel.start('http://127.0.0.1:53120', vi.fn());
    const spawnEnvironment = calls[0]?.options.env ?? {};
    // Whatever ~/.cloudflared/config.yml says, cloudflared is told to read this run's file instead.
    expect(path.basename(path.dirname(configOf(calls[0]?.args ?? [])))).toMatch(/^otb-cloudflared-/u);
    expect(Object.keys(spawnEnvironment).sort()).toEqual(['HOME', 'PATH', 'USERPROFILE']);
    expect(JSON.stringify(calls[0])).not.toContain('secret-token');
    announce(children[0], 'room');
    await starting;
    await tunnel.stop();
  });

  it('removes the private configuration when the tunnel stops', async () => {
    const { children, calls, tunnel } = fixture();
    const starting = tunnel.start('http://127.0.0.1:53120', vi.fn());
    const config = configOf(calls[0]?.args ?? []);
    expect(existsSync(config)).toBe(true);
    announce(children[0], 'room');
    await starting;
    await tunnel.stop();
    expect(existsSync(config)).toBe(false);
    expect(existsSync(path.dirname(config))).toBe(false);
  });

  it('reports a startup failure when cloudflared exits before it prints a URL', async () => {
    const { children, calls, tunnel } = fixture({ children: [fakeChild(), fakeChild()] });
    const onLost = vi.fn();
    const starting = tunnel.start('http://127.0.0.1:53120', onLost);
    const config = configOf(calls[0]?.args ?? []);
    (children[0]).stderr.emit('data', Buffer.from('ERR Cannot determine default origin certificate path'));
    (children[0]).emit('exit', 1);
    await expect(starting).rejects.toThrow('TUNNEL_START_FAILED');
    expect(onLost).not.toHaveBeenCalled();
    expect(existsSync(config)).toBe(false);
    // The failure leaves nothing running: the next start is a clean one.
    const second = tunnel.start('http://127.0.0.1:53120', onLost);
    announce(children[1], 'again');
    await expect(second).resolves.toBe('https://again.trycloudflare.com');
    await tunnel.stop();
  });

  it('reports a startup failure when the process cannot be spawned', async () => {
    const { children, tunnel } = fixture();
    const starting = tunnel.start('http://127.0.0.1:53120', vi.fn());
    (children[0]).emit('error', new Error('spawn UNKNOWN'));
    await expect(starting).rejects.toThrow('TUNNEL_START_FAILED');
    expect((children[0]).kill).toHaveBeenCalled();
  });

  it('gives up on a tunnel that never announces a URL and cleans up', async () => {
    vi.useFakeTimers();
    const { children, calls, tunnel } = fixture();
    const starting = tunnel.start('http://127.0.0.1:53120', vi.fn());
    const outcome = starting.then(() => 'started', (error: Error) => error.message);
    const config = configOf(calls[0]?.args ?? []);
    await vi.advanceTimersByTimeAsync(25_001);
    await expect(outcome).resolves.toBe('TUNNEL_START_TIMEOUT');
    expect((children[0]).kill).toHaveBeenCalled();
    expect(existsSync(config)).toBe(false);
  });

  it('ignores a URL that is not a root trycloudflare hostname', async () => {
    vi.useFakeTimers();
    const { children, tunnel } = fixture();
    const starting = tunnel.start('http://127.0.0.1:53120', vi.fn());
    const outcome = starting.then(() => 'started', (error: Error) => error.message);
    (children[0]).stderr.emit('data', Buffer.from('visit https://evil.example.com or https://room.trycloudflare.com.evil.test/'));
    await vi.advanceTimersByTimeAsync(25_001);
    await expect(outcome).resolves.toBe('TUNNEL_START_TIMEOUT');
  });

  it('reports an unexpected exit after startup exactly once', async () => {
    const { children, calls, tunnel } = fixture();
    const onLost = vi.fn();
    const starting = tunnel.start('http://127.0.0.1:53120', onLost);
    const config = configOf(calls[0]?.args ?? []);
    announce(children[0], 'room');
    await starting;
    (children[0]).emit('exit', 1);
    expect(onLost).toHaveBeenCalledOnce();
    expect(existsSync(config)).toBe(false);
    (children[0]).emit('exit', 1);
    expect(onLost).toHaveBeenCalledOnce();
  });

  it('can be recreated after a stop and then yields a new hostname and a new private directory', async () => {
    const { children, calls, tunnel } = fixture({ children: [fakeChild(), fakeChild()] });
    const onLost = vi.fn();
    const first = tunnel.start('http://127.0.0.1:53120', onLost);
    announce(children[0], 'first');
    expect(await first).toBe('https://first.trycloudflare.com');
    const firstConfig = configOf(calls[0]?.args ?? []);
    await tunnel.stop();

    const second = tunnel.start('http://127.0.0.1:53120', onLost);
    announce(children[1], 'second');
    expect(await second).toBe('https://second.trycloudflare.com');
    const secondConfig = configOf(calls[1]?.args ?? []);
    expect(secondConfig).not.toBe(firstConfig);
    expect(existsSync(firstConfig)).toBe(false);
    expect(existsSync(secondConfig)).toBe(true);
    expect(onLost).not.toHaveBeenCalled();
    await tunnel.stop();
  });

  it('does not let the late exit of a stopped tunnel disturb the tunnel that replaced it', async () => {
    vi.useFakeTimers();
    const stuck = fakeChild(false);
    const replacement = fakeChild();
    const { calls, tunnel } = fixture({ children: [stuck, replacement] });
    const lostFirst = vi.fn();
    const lostSecond = vi.fn();
    const first = tunnel.start('http://127.0.0.1:53120', lostFirst);
    announce(stuck, 'first');
    await first;
    const stopping = tunnel.stop();
    await vi.advanceTimersByTimeAsync(2_001);
    await stopping;
    expect(stuck.kill).toHaveBeenCalledWith('SIGKILL');

    const second = tunnel.start('http://127.0.0.1:53120', lostSecond);
    announce(replacement, 'second');
    await second;
    const secondConfig = configOf(calls[1]?.args ?? []);

    stuck.emit('exit', 0);
    expect(lostFirst).not.toHaveBeenCalled();
    expect(lostSecond).not.toHaveBeenCalled();
    expect(existsSync(secondConfig)).toBe(true);
    // The replacement is still the tunnel's child: its own loss is still reported.
    replacement.emit('exit', 1);
    expect(lostSecond).toHaveBeenCalledOnce();
    await tunnel.stop();
  });

  it('refuses a second concurrent tunnel and a non-loopback origin', async () => {
    const { children, tunnel } = fixture();
    const starting = tunnel.start('http://127.0.0.1:53120', vi.fn());
    announce(children[0], 'room');
    await starting;
    await expect(tunnel.start('http://127.0.0.1:53120', vi.fn())).rejects.toThrow('TUNNEL_ALREADY_RUNNING');
    await tunnel.stop();
    await expect(tunnel.start('http://192.168.1.20:53120', vi.fn())).rejects.toThrow('TUNNEL_ORIGIN_INVALID');
    await expect(tunnel.start('https://127.0.0.1:53120', vi.fn())).rejects.toThrow('TUNNEL_ORIGIN_INVALID');
    await expect(tunnel.start('http://127.0.0.1', vi.fn())).rejects.toThrow('TUNNEL_ORIGIN_INVALID');
  });
});
