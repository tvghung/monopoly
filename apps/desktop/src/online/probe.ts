import { quickTunnelEndpoint } from './connectivity';

export type OnlineStage = 'HELPER_READY' | 'BINARY_VERIFY' | 'TUNNEL_SPAWN' | 'URL_ANNOUNCEMENT'
  | 'PUBLIC_READINESS' | 'PUBLIC_PAGE' | 'PUBLIC_ROOM';
export type OnlineFailure = 'DNS' | 'PROXY' | 'TLS' | 'TIMEOUT' | 'NETWORK' | 'HTTP'
  | 'CONTENT' | 'REDIRECT' | 'TUNNEL_EXIT' | 'SPAWN' | 'INTEGRITY' | 'HELPER' | 'CANCELLED' | 'INVALID_ENDPOINT';
export interface OnlineDiagnostic {
  stage: OnlineStage;
  outcome: 'STARTED' | 'RETRYING' | 'PASSED' | 'FAILED';
  reason?: OnlineFailure;
  httpStatus?: number;
  /** Allowlisted error identifier only; never an exception message or URL. */
  networkCode?: OnlineNetworkCode;
  /** Local resolver observations do not prove public reachability. */
  resolver?: 'BOTH' | 'SYSTEM_ONLY' | 'ELECTRON_ONLY' | 'NEITHER' | 'UNAVAILABLE';
  resolverCache?: 'CLEARED' | 'FAILED' | 'UNAVAILABLE';
  tunnelConnected?: boolean;
  elapsedMs: number;
  attempts: number;
}

export type OnlineFetcher = (input: string, init: RequestInit) => Promise<Response>;
export type OnlineNetworkCode = 'ENOTFOUND' | 'EAI_AGAIN' | 'ERR_NAME_NOT_RESOLVED'
  | 'ERR_DNS_TIMED_OUT' | 'ERR_PROXY_CONNECTION_FAILED' | 'ERR_TUNNEL_CONNECTION_FAILED'
  | 'ERR_CERT_AUTHORITY_INVALID' | 'ERR_CERT_DATE_INVALID' | 'ERR_CERT_COMMON_NAME_INVALID'
  | 'ERR_TIMED_OUT' | 'ETIMEDOUT' | 'ERR_INTERNET_DISCONNECTED';

export interface OnlineHostResolver {
  resolve(hostname: string, source: 'system' | 'any'): Promise<void>;
  clearCache(): Promise<void>;
}

const NETWORK_CODES: readonly OnlineNetworkCode[] = [
  'ENOTFOUND', 'EAI_AGAIN', 'ERR_NAME_NOT_RESOLVED', 'ERR_DNS_TIMED_OUT',
  'ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED',
  'ERR_CERT_AUTHORITY_INVALID', 'ERR_CERT_DATE_INVALID', 'ERR_CERT_COMMON_NAME_INVALID',
  'ERR_TIMED_OUT', 'ETIMEDOUT', 'ERR_INTERNET_DISCONNECTED',
];

export function safeNetworkCode(error: unknown): OnlineNetworkCode | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const value = `${'code' in current ? String(current.code) : ''} ${current.message}`.toUpperCase();
    const found = NETWORK_CODES.find(code => new RegExp(`(^|[^A-Z0-9_])${code}($|[^A-Z0-9_])`).test(value));
    if (found) return found;
    current = current.cause;
  }
  return undefined;
}

export function classifyNetworkException(error: unknown): OnlineFailure {
  const code = safeNetworkCode(error);
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ERR_NAME_NOT_RESOLVED'
    || code === 'ERR_DNS_TIMED_OUT') return 'DNS';
  const values: string[] = [];
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    values.push(current.name, current.message, 'code' in current ? String(current.code) : '');
    current = current.cause;
  }
  const message = values.join(' ').toUpperCase();
  if (/REDIRECT/.test(message)) return 'REDIRECT';
  if (/ABORT|CANCEL/.test(message)) return 'CANCELLED';
  if (/TIMEOUT|TIMED_OUT|TIMEDOUT/.test(message)) return 'TIMEOUT';
  if (/CERT|SSL|TLS|ERR_TLS|ERR_SSL/.test(message)) return 'TLS';
  if (/PROXY|TUNNEL_CONNECTION|407/.test(message)) return 'PROXY';
  if (/ENOTFOUND|EAI_AGAIN|DNS|NAME_NOT_RESOLVED/.test(message)) return 'DNS';
  return 'NETWORK';
}

export class OnlineProbeError extends Error {
  constructor(public readonly reason: OnlineFailure, public readonly httpStatus?: number,
    public readonly networkCode?: OnlineNetworkCode) {
    super('ONLINE_FAILED');
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new OnlineProbeError('CANCELLED')); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = (): void => { clearTimeout(timer); reject(new OnlineProbeError('CANCELLED')); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('ABORTED')); return; }
    const abort = (): void => reject(new Error('ABORTED'));
    signal.addEventListener('abort', abort, { once: true });
    void operation.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => {
      signal.removeEventListener('abort', abort);
      reject(error instanceof Error ? error : new Error('NETWORK'));
    });
  });
}

async function request(fetcher: OnlineFetcher, url: string, signal: AbortSignal): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 5_000);
  const combined = AbortSignal.any([signal, timeout.signal]);
  try {
    const response = await withAbort(fetcher(url, {
      method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: combined,
    }), combined);
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      if (response.status >= 300 && response.status < 400) throw new OnlineProbeError('REDIRECT', response.status);
      throw new OnlineProbeError('HTTP', response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof OnlineProbeError) throw error;
    if (signal.aborted) throw new OnlineProbeError('CANCELLED');
    if (timeout.signal.aborted) throw new OnlineProbeError('TIMEOUT');
    throw new OnlineProbeError(classifyNetworkException(error), undefined, safeNetworkCode(error));
  } finally {
    clearTimeout(timer);
  }
}

async function boundedObservation(operation: () => Promise<void>, signal: AbortSignal): Promise<'PASS' | 'FAIL' | 'UNKNOWN'> {
  if (signal.aborted) return 'UNKNOWN';
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: 'PASS' | 'FAIL' | 'UNKNOWN'): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      resolve(value);
    };
    const aborted = (): void => finish('UNKNOWN');
    const timer = setTimeout(() => finish('UNKNOWN'), 2_000);
    signal.addEventListener('abort', aborted, { once: true });
    try { void operation().then(() => finish('PASS'), () => finish('FAIL')); }
    catch { finish('FAIL'); }
  });
}

async function observeAndRefreshResolver(resolver: OnlineHostResolver, hostname: string,
  signal: AbortSignal): Promise<Pick<OnlineDiagnostic, 'resolver' | 'resolverCache'>> {
  const [system, electron] = await Promise.all([
    boundedObservation(() => resolver.resolve(hostname, 'system'), signal),
    boundedObservation(() => resolver.resolve(hostname, 'any'), signal),
  ]);
  // A fresh resolveHost query bypasses the cache for observation. Clear the cache used by net.fetch before retrying.
  const cleared = await boundedObservation(() => resolver.clearCache(), signal);
  const resolverCache = cleared === 'PASS' ? 'CLEARED' : cleared === 'FAIL' ? 'FAILED' : 'UNAVAILABLE';
  if (system === 'UNKNOWN' || electron === 'UNKNOWN') return { resolver: 'UNAVAILABLE', resolverCache };
  if (system === 'PASS') return { resolver: electron === 'PASS' ? 'BOTH' : 'SYSTEM_ONLY', resolverCache };
  return { resolver: electron === 'PASS' ? 'ELECTRON_ONLY' : 'NEITHER', resolverCache };
}

async function hasHtml(response: Response, signal: AbortSignal): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) return false;
  const decoder = new TextDecoder();
  let sample = '';
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 5_000);
  const combined = AbortSignal.any([signal, timeout.signal]);
  try {
    while (sample.length < 65_536) {
      const { done, value } = await withAbort(reader.read(), combined);
      if (done) break;
      sample += decoder.decode(value, { stream: true });
      if (/<html[\s>]/i.test(sample)) return true;
    }
    return /<html[\s>]/i.test(sample);
  } catch (error) {
    if (signal.aborted) throw new OnlineProbeError('CANCELLED');
    if (timeout.signal.aborted) throw new OnlineProbeError('TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

/** Probe the exact validated tunnel origin. Redirects are refused, and no cookie or credential is sent. */
export async function probePublicTunnel(
  endpoint: string,
  fetcher: OnlineFetcher,
  signal: AbortSignal,
  report: (diagnostic: OnlineDiagnostic) => void,
  maxMs = 150_000,
  resolver?: OnlineHostResolver,
): Promise<void> {
  if (quickTunnelEndpoint(endpoint) !== endpoint) throw new OnlineProbeError('INVALID_ENDPOINT');
  const started = Date.now();
  let attempts = 0;
  let resolverObservation: Pick<OnlineDiagnostic, 'resolver' | 'resolverCache'> = {};
  let lastResolverCheck = Number.NEGATIVE_INFINITY;
  while (Date.now() - started < maxMs) {
    if (signal.aborted) throw new OnlineProbeError('CANCELLED');
    attempts += 1;
    let stage: OnlineStage = 'PUBLIC_READINESS';
    try {
      report({ stage, outcome: 'STARTED', elapsedMs: Date.now() - started, attempts });
      const ready = await request(fetcher, `${endpoint}/readyz`, signal);
      void ready.body?.cancel().catch(() => undefined);
      stage = 'PUBLIC_PAGE';
      report({ stage, outcome: 'STARTED', elapsedMs: Date.now() - started, attempts });
      const page = await request(fetcher, `${endpoint}/`, signal);
      if (!await hasHtml(page, signal)) throw new OnlineProbeError('CONTENT');
      report({ stage, outcome: 'PASSED', elapsedMs: Date.now() - started, attempts, ...resolverObservation });
      return;
    } catch (error) {
      const failure = error instanceof OnlineProbeError ? error
        : new OnlineProbeError(classifyNetworkException(error), undefined, safeNetworkCode(error));
      if (failure.reason === 'DNS' && resolver && Date.now() - lastResolverCheck >= 15_000 && !signal.aborted) {
        lastResolverCheck = Date.now();
        resolverObservation = await observeAndRefreshResolver(resolver, new URL(endpoint).hostname, signal);
      }
      const elapsedMs = Date.now() - started;
      if (signal.aborted) {
        report({ stage, outcome: 'FAILED', reason: 'CANCELLED', elapsedMs, attempts, ...resolverObservation });
        throw new OnlineProbeError('CANCELLED');
      }
      const delay = Math.min(5_000, 1_000 * (2 ** Math.min(attempts - 1, 3)));
      const terminalHttp = failure.reason === 'HTTP' && failure.httpStatus !== undefined
        && failure.httpStatus >= 400 && failure.httpStatus < 500 && failure.httpStatus !== 429;
      const retry = !signal.aborted && !terminalHttp && failure.reason !== 'CANCELLED'
        && failure.reason !== 'REDIRECT' && failure.reason !== 'INVALID_ENDPOINT'
        && failure.reason !== 'TLS' && failure.reason !== 'CONTENT' && elapsedMs + delay < maxMs;
      report({ stage, outcome: retry ? 'RETRYING' : 'FAILED', reason: failure.reason,
        ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }),
        ...(failure.networkCode === undefined ? {} : { networkCode: failure.networkCode }),
        ...resolverObservation, elapsedMs, attempts });
      if (!retry) throw failure;
      try { await wait(delay, signal); } catch {
        report({ stage, outcome: 'FAILED', reason: 'CANCELLED', elapsedMs: Date.now() - started, attempts });
        throw new OnlineProbeError('CANCELLED');
      }
    }
  }
  throw new OnlineProbeError('TIMEOUT');
}
