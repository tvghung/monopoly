import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyNetworkException, OnlineProbeError, probePublicTunnel, type OnlineDiagnostic } from './probe';

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

  it.each([403, 502, 503])('records a terminal HTTP %i with stage and attempts', async status => {
    vi.useFakeTimers();
    const events: OnlineDiagnostic[] = [];
    const task = probePublicTunnel(endpoint, () => Promise.resolve(new Response(null, { status })),
      new AbortController().signal, event => events.push(event), 2_200);
    const outcome = task.catch((error: OnlineProbeError) => error);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await outcome).toMatchObject({ httpStatus: status });
    expect(events.at(-1)).toMatchObject({ stage: 'PUBLIC_READINESS', outcome: 'FAILED',
      reason: 'HTTP', httpStatus: status, attempts: 3 });
  });

  it('rejects redirect and non-HTML pages instead of publishing an unchecked destination', async () => {
    vi.useFakeTimers();
    const events: OnlineDiagnostic[] = [];
    const redirect = probePublicTunnel(endpoint, () => Promise.resolve(new Response(null,
      { status: 302, headers: { location: 'https://other.example/' } })),
    new AbortController().signal, event => events.push(event), 500);
    await expect(redirect).rejects.toMatchObject({ reason: 'HTTP', httpStatus: 302 });
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
