import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyNetworkException, OnlineProbeError, probePublicTunnel, safeNetworkCode,
  type OnlineDiagnostic } from './probe';

const endpoint = 'https://room.trycloudflare.com';
const html = () => new Response('<html>Own the Block</html>', { status: 200 });
const ready = () => new Response('ready', { status: 200 });

afterEach(() => vi.useRealTimers());

describe('public Online probes', () => {
  it.each([
    [new Error('getaddrinfo ENOTFOUND'), 'DNS'],
    [new Error('net::ERR_NAME_NOT_RESOLVED'), 'DNS'],
    [new Error('net::ERR_PROXY_CONNECTION_FAILED'), 'PROXY'],
    [new Error('net::ERR_CERT_AUTHORITY_INVALID'), 'TLS'],
    [new Error('CERT_HAS_EXPIRED'), 'TLS'],
    [new Error('Redirect was cancelled'), 'REDIRECT'],
    [new Error('ETIMEDOUT'), 'TIMEOUT'],
  ] as const)('classifies a safe network reason for %s', (error, reason) => {
    expect(classifyNetworkException(error)).toBe(reason);
  });

  it('preserves only an allowlisted network code', () => {
    expect(safeNetworkCode(new Error('net::ERR_NAME_NOT_RESOLVED https://private.example'))).toBe('ERR_NAME_NOT_RESOLVED');
    expect(safeNetworkCode(new Error('private hostname and secret token'))).toBeUndefined();
  });

  it('completes a healthy public route without DNS recovery or retry waiting', async () => {
    vi.useFakeTimers();
    const events: OnlineDiagnostic[] = [];
    const resolver = { resolve: vi.fn(() => Promise.resolve()), clearCache: vi.fn(() => Promise.resolve()) };
    const fetcher = vi.fn((url: string) => Promise.resolve(url.endsWith('/readyz') ? ready() : html()));
    const task = probePublicTunnel(endpoint, fetcher, new AbortController().signal,
      event => events.push(event), 150_000, resolver);
    await task;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(resolver.clearCache).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ stage: 'PUBLIC_PAGE', outcome: 'PASSED', elapsedMs: 0, attempts: 1 });
  });

  it('accepts delayed readiness, then the actual HTML page, without exposing the endpoint in diagnostics', async () => {
    vi.useFakeTimers();
    const events: OnlineDiagnostic[] = [];
    let attempts = 0;
    const fetcher = vi.fn((url: string, init: RequestInit) => {
      expect(init.redirect).toBe('manual');
      expect(init.credentials).toBe('omit');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      if (url.endsWith('/readyz')) {
        attempts += 1;
        return Promise.resolve(attempts === 1 ? new Response(null, { status: 503 }) : ready());
      }
      return Promise.resolve(html());
    });
    const task = probePublicTunnel(endpoint, fetcher, new AbortController().signal, event => events.push(event), 5_000);
    await vi.advanceTimersByTimeAsync(1_100);
    await task;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(events).toContainEqual(expect.objectContaining({ stage: 'PUBLIC_READINESS', reason: 'HTTP', httpStatus: 503,
      outcome: 'RETRYING', attempts: 1 }));
    expect(events.at(-1)).toMatchObject({ stage: 'PUBLIC_PAGE', outcome: 'PASSED', attempts: 2 });
    expect(JSON.stringify(events)).not.toContain(endpoint);
  });

  it('clears a negative Electron DNS cache and reports system versus Electron resolution safely', async () => {
    vi.useFakeTimers();
    let cachedFailure = true;
    const resolver = {
      resolve: vi.fn((_hostname: string, source: 'system' | 'any') => source === 'system'
        ? Promise.resolve() : Promise.reject(new Error('unavailable'))),
      clearCache: vi.fn(() => { cachedFailure = false; return Promise.resolve(); }),
    };
    const fetcher = vi.fn((url: string) => cachedFailure
      ? Promise.reject(new Error('net::ERR_NAME_NOT_RESOLVED private-host.example'))
      : Promise.resolve(url.endsWith('/readyz') ? ready() : html()));
    const events: OnlineDiagnostic[] = [];
    const task = probePublicTunnel(endpoint, fetcher, new AbortController().signal,
      event => events.push(event), 10_000, resolver);
    await vi.advanceTimersByTimeAsync(1_100);
    await task;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(resolver.resolve).toHaveBeenCalledWith('room.trycloudflare.com', 'system');
    expect(resolver.resolve).toHaveBeenCalledWith('room.trycloudflare.com', 'any');
    expect(resolver.clearCache).toHaveBeenCalledOnce();
    expect(events).toContainEqual(expect.objectContaining({ reason: 'DNS', networkCode: 'ERR_NAME_NOT_RESOLVED',
      resolver: 'SYSTEM_ONLY', resolverCache: 'CLEARED', outcome: 'RETRYING' }));
    expect(JSON.stringify(events)).not.toContain('private-host.example');
  });

  it('eventually accepts a freshly announced hostname after transient DNS errors and delayed HTTP readiness', async () => {
    vi.useFakeTimers();
    let readiness = 0;
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith('/readyz')) {
        readiness += 1;
        if (readiness <= 2) return Promise.reject(new Error('getaddrinfo ENOTFOUND'));
        if (readiness === 3) return Promise.resolve(new Response(null, { status: 503 }));
        return Promise.resolve(ready());
      }
      return Promise.resolve(html());
    });
    const events: OnlineDiagnostic[] = [];
    const task = probePublicTunnel(endpoint, fetcher, new AbortController().signal,
      event => events.push(event), 20_000);
    await vi.advanceTimersByTimeAsync(8_000);
    await task;
    expect(events.filter(event => event.reason === 'DNS')).toHaveLength(2);
    expect(events).toContainEqual(expect.objectContaining({ httpStatus: 503, outcome: 'RETRYING' }));
    expect(events.at(-1)).toMatchObject({ stage: 'PUBLIC_PAGE', outcome: 'PASSED', attempts: 4 });
  });

  it('bounds persistent DNS filtering and reports neither resolver working without publishing', async () => {
    vi.useFakeTimers();
    const events: OnlineDiagnostic[] = [];
    const resolver = {
      resolve: vi.fn(() => Promise.reject(new Error('blocked'))),
      clearCache: vi.fn(() => Promise.resolve()),
    };
    const fetcher = vi.fn(() => Promise.reject(new Error('net::ERR_NAME_NOT_RESOLVED')));
    const task = probePublicTunnel(endpoint, fetcher, new AbortController().signal,
      event => events.push(event), 12_000, resolver).catch((error: OnlineProbeError) => error);
    await vi.advanceTimersByTimeAsync(13_000);
    expect(await task).toMatchObject({ reason: 'DNS' });
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(4);
    expect(resolver.clearCache).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ outcome: 'FAILED', reason: 'DNS', resolver: 'NEITHER' });
  });

  it('cancels promptly while an Electron resolver observation is pending', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn(() => Promise.reject(new Error('net::ERR_NAME_NOT_RESOLVED')));
    const resolver = { resolve: vi.fn(() => new Promise<void>(() => undefined)),
      clearCache: vi.fn(() => Promise.resolve()) };
    const events: OnlineDiagnostic[] = [];
    const task = probePublicTunnel(endpoint, fetcher, controller.signal,
      event => events.push(event), 150_000, resolver).catch((error: OnlineProbeError) => error);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    expect(await task).toMatchObject({ reason: 'CANCELLED' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ outcome: 'FAILED', reason: 'CANCELLED' });
  });

  it('stops immediately on a TLS verification failure', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('net::ERR_CERT_AUTHORITY_INVALID')));
    const events: OnlineDiagnostic[] = [];
    await expect(probePublicTunnel(endpoint, fetcher, new AbortController().signal,
      event => events.push(event))).rejects.toMatchObject({ reason: 'TLS' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ reason: 'TLS', networkCode: 'ERR_CERT_AUTHORITY_INVALID',
      outcome: 'FAILED' });
  });

  it('bounds a fetch adapter that never settles even after abort', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    const events: OnlineDiagnostic[] = [];
    const task = probePublicTunnel(endpoint, fetcher, new AbortController().signal,
      event => events.push(event), 5_500).catch((error: OnlineProbeError) => error);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await task).toMatchObject({ reason: 'TIMEOUT' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ outcome: 'FAILED', reason: 'TIMEOUT' });
  });

  it.each([[403, 1], [429, 2], [502, 2], [503, 2]])('records HTTP %i with stage and bounded attempts', async (status, count) => {
    vi.useFakeTimers();
    const events: OnlineDiagnostic[] = [];
    const task = probePublicTunnel(endpoint, () => Promise.resolve(new Response(null, { status })),
      new AbortController().signal, event => events.push(event), 2_200);
    const outcome = task.catch((error: OnlineProbeError) => error);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await outcome).toMatchObject({ httpStatus: status });
    expect(events.at(-1)).toMatchObject({ stage: 'PUBLIC_READINESS', outcome: 'FAILED',
      reason: 'HTTP', httpStatus: status, attempts: count });
  });

  it('rejects redirect and non-HTML pages instead of publishing an unchecked destination', async () => {
    vi.useFakeTimers();
    const events: OnlineDiagnostic[] = [];
    const redirect = probePublicTunnel(endpoint, () => Promise.resolve(new Response(null,
      { status: 302, headers: { location: 'https://other.example/' } })),
    new AbortController().signal, event => events.push(event), 500);
    await expect(redirect).rejects.toMatchObject({ reason: 'REDIRECT', httpStatus: 302 });
    expect(events.at(-1)?.outcome).toBe('FAILED');
    const content = probePublicTunnel(endpoint, url => Promise.resolve(url.endsWith('/readyz') ? ready()
      : new Response('not a game page')), new AbortController().signal, () => undefined, 500);
    await expect(content).rejects.toMatchObject({ reason: 'CONTENT' });
  });

  it('records a public request timeout without raw exception details', async () => {
    const events: OnlineDiagnostic[] = [];
    await expect(probePublicTunnel(endpoint,
      () => Promise.reject(new Error('net::ERR_TIMED_OUT private details')),
      new AbortController().signal, event => events.push(event), 500))
      .rejects.toMatchObject({ reason: 'TIMEOUT' });
    expect(events.at(-1)).toMatchObject({ stage: 'PUBLIC_READINESS', outcome: 'FAILED', reason: 'TIMEOUT' });
    expect(JSON.stringify(events)).not.toContain('private details');
  });

  it('cancels an in-flight retry promptly and never starts another request', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const fetcher = vi.fn(() => Promise.reject(new Error('getaddrinfo ENOTFOUND')));
    const events: OnlineDiagnostic[] = [];
    const task = probePublicTunnel(endpoint, fetcher, abort.signal, event => events.push(event));
    const outcome = task.catch((error: OnlineProbeError) => error);
    await vi.advanceTimersByTimeAsync(100);
    abort.abort();
    await expect(outcome).resolves.toMatchObject({ reason: 'CANCELLED' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ outcome: 'FAILED', reason: 'CANCELLED' });
  });

  it('refuses an invalid or untrusted endpoint before any request', async () => {
    const fetcher = vi.fn(() => Promise.resolve(html()));
    await expect(probePublicTunnel('http://room.trycloudflare.com', fetcher,
      new AbortController().signal, () => undefined)).rejects.toMatchObject({ reason: 'INVALID_ENDPOINT' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
