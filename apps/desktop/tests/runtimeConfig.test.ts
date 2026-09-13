import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DesktopRuntimeConfigError,
  readPackagedReleaseConfig,
  resolveSocketUrl,
  type DesktopSocketUrlOptions,
} from '../src/runtimeConfig';

function options(overrides: Partial<DesktopSocketUrlOptions> = {}): DesktopSocketUrlOptions {
  return {
    isPackaged: false,
    argv: [],
    env: {},
    ...overrides,
  };
}

describe('desktop socket endpoint configuration', () => {
  it('keeps the loopback fallback for development', () => {
    expect(resolveSocketUrl(options())).toBe('http://127.0.0.1:8080');
  });

  it('accepts a configured http or https endpoint', () => {
    expect(resolveSocketUrl(options({
      env: { OWN_THE_BLOCK_SOCKET_URL: 'https://play.example.test/' },
    }))).toBe('https://play.example.test');
  });

  it('uses CLI over environment and packaged release configuration', () => {
    expect(resolveSocketUrl(options({
      isPackaged: true,
      argv: ['--socket-url=https://cli.example.test/'],
      env: { OWN_THE_BLOCK_SOCKET_URL: 'https://env.example.test' },
      packagedConfig: { socketUrl: 'https://package.example.test' },
    }))).toBe('https://cli.example.test');
  });

  it('uses environment over packaged release configuration', () => {
    expect(resolveSocketUrl(options({
      isPackaged: true,
      env: { OWN_THE_BLOCK_SOCKET_URL: 'https://env.example.test/' },
      packagedConfig: { socketUrl: 'https://package.example.test' },
    }))).toBe('https://env.example.test');
  });

  it('uses a valid packaged release configuration when no override is supplied', () => {
    expect(resolveSocketUrl(options({
      isPackaged: true,
      packagedConfig: { socketUrl: 'https://package.example.test/' },
    }))).toBe('https://package.example.test');
  });

  it('rejects unsupported protocols', () => {
    expect(() => resolveSocketUrl(options({
      isPackaged: true,
      argv: ['--socket-url=ws://play.example.test'],
    }))).toThrowError(new DesktopRuntimeConfigError(
      'SOCKET_URL_INVALID',
      'Desktop socket endpoint must be an absolute http or https URL.',
    ));
  });

  it('opens a packaged LAN-first build without an external endpoint', () => {
    expect(resolveSocketUrl(options({ isPackaged: true }))).toBeUndefined();
  });

  it('does not substitute loopback in a packaged build, but accepts an explicitly supplied loopback endpoint', () => {
    expect(resolveSocketUrl(options({ isPackaged: true }))).toBeUndefined();
    expect(resolveSocketUrl(options({
      isPackaged: true,
      argv: ['--socket-url=http://127.0.0.1:8080'],
    }))).toBe('http://127.0.0.1:8080');
  });

  it('does not let an invalid CLI or environment value fall through to a lower-precedence source', () => {
    expect(() => resolveSocketUrl(options({
      isPackaged: true,
      argv: ['--socket-url=not-a-url'],
      env: { OWN_THE_BLOCK_SOCKET_URL: 'https://env.example.test' },
      packagedConfig: { socketUrl: 'https://package.example.test' },
    }))).toThrowError(expect.objectContaining({ code: 'SOCKET_URL_INVALID' }));

    expect(() => resolveSocketUrl(options({
      isPackaged: true,
      env: { OWN_THE_BLOCK_SOCKET_URL: '' },
      packagedConfig: { socketUrl: 'https://package.example.test' },
    }))).toThrowError(expect.objectContaining({ code: 'SOCKET_URL_INVALID' }));
  });

  it('reads valid, missing, and malformed packaged configuration files distinctly', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'own-the-block-release-config-'));
    try {
      const validPath = path.join(root, 'valid.json');
      writeFileSync(validPath, JSON.stringify({ version: '3.0.0', socketUrl: 'https://package.example.test' }));
      expect(readPackagedReleaseConfig(validPath)).toEqual({
        version: '3.0.0',
        socketUrl: 'https://package.example.test',
      });
      expect(readPackagedReleaseConfig(path.join(root, 'missing.json'))).toBeUndefined();

      const malformedPath = path.join(root, 'malformed.json');
      writeFileSync(malformedPath, '{');
      expect(() => readPackagedReleaseConfig(malformedPath)).toThrowError(
        expect.objectContaining({ code: 'SOCKET_URL_INVALID' }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
