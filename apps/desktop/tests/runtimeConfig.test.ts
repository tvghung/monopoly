import { describe, expect, it } from 'vitest';
import {
  DesktopRuntimeConfigError,
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

  it('rejects unsupported protocols', () => {
    expect(() => resolveSocketUrl(options({
      isPackaged: true,
      argv: ['--socket-url=ws://play.example.test'],
    }))).toThrowError(new DesktopRuntimeConfigError(
      'SOCKET_URL_INVALID',
      'Desktop socket endpoint must be an absolute http or https URL.',
    ));
  });

  it('fails closed when a packaged build has no endpoint', () => {
    expect(() => resolveSocketUrl(options({ isPackaged: true }))).toThrowError(
      expect.objectContaining({ code: 'PACKAGED_SOCKET_URL_MISSING' }),
    );
  });

  it('does not substitute loopback in a packaged build, but accepts an explicitly supplied loopback endpoint', () => {
    expect(() => resolveSocketUrl(options({ isPackaged: true }))).toThrow();
    expect(resolveSocketUrl(options({
      isPackaged: true,
      argv: ['--socket-url=http://127.0.0.1:8080'],
    }))).toBe('http://127.0.0.1:8080');
  });
});
