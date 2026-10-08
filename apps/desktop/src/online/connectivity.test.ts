import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { CloudflareQuickTunnel, quickTunnelEndpoint } from './connectivity';

describe('Quick Tunnel endpoint validation', () => {
  it('accepts only a root HTTPS trycloudflare hostname', () => {
    expect(quickTunnelEndpoint('https://room.trycloudflare.com/')).toBe('https://room.trycloudflare.com');
    expect(quickTunnelEndpoint('https://room.trycloudflare.com.evil.test/')).toBeUndefined();
    expect(quickTunnelEndpoint('http://room.trycloudflare.com/')).toBeUndefined();
    expect(quickTunnelEndpoint('https://user:pass@room.trycloudflare.com/')).toBeUndefined();
  });
});

describe('Cloudflare Quick Tunnel process', () => {
  function fixture() {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(), stderr: new EventEmitter(),
      kill: vi.fn(() => {
        queueMicrotask(() => child.emit('exit', 0));
        return true;
      }),
    });
    const spawnProcess = vi.fn(() => child as unknown as ReturnType<typeof spawn>);
    const tunnel = new CloudflareQuickTunnel(undefined, spawnProcess as unknown as typeof spawn,
      () => 'C:\\tools\\cloudflared.exe');
    return { child, spawnProcess, tunnel };
  }

  it('starts without a shell, reads the verified public URL, and stops the process', async () => {
    const { child, spawnProcess, tunnel } = fixture();
    const onLost = vi.fn();
    const starting = tunnel.start('http://127.0.0.1:53120', onLost);
    expect(spawnProcess).toHaveBeenCalledWith('C:\\tools\\cloudflared.exe',
      ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:53120'],
      { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.emit('data', Buffer.from('Tunnel available at https://room.trycloudflare.com'));
    await expect(starting).resolves.toBe('https://room.trycloudflare.com');
    await tunnel.stop();
    expect(child.kill).toHaveBeenCalledOnce();
    expect(onLost).not.toHaveBeenCalled();
  });

  it('reports an unexpected exit after startup', async () => {
    const { child, tunnel } = fixture();
    const onLost = vi.fn();
    const starting = tunnel.start('http://127.0.0.1:53120', onLost);
    child.stderr.emit('data', Buffer.from('https://room.trycloudflare.com'));
    await starting;
    child.emit('exit', 1);
    expect(onLost).toHaveBeenCalledOnce();
  });
});
