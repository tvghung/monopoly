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
  elapsedMs: number;
  attempts: number;
}

export type OnlineFetcher = (input: string, init: RequestInit) => Promise<Response>;

export function classifyNetworkException(error: unknown): OnlineFailure {
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
  constructor(public readonly reason: OnlineFailure, public readonly httpStatus?: number) {
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

async function request(fetcher: OnlineFetcher, url: string, signal: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(5_000);
  const combined = AbortSignal.any([signal, timeout]);
  try {
    const response = await fetcher(url, {
      method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: combined,
    });
    if (!response.ok) throw new OnlineProbeError('HTTP', response.status);
    return response;
  } catch (error) {
    if (error instanceof OnlineProbeError) throw error;
    if (signal.aborted) throw new OnlineProbeError('CANCELLED');
    if (timeout.aborted) throw new OnlineProbeError('TIMEOUT');
    throw new OnlineProbeError(classifyNetworkException(error));
  }
}

async function hasHtml(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) return false;
  const decoder = new TextDecoder();
  let sample = '';
  try {
    while (sample.length < 65_536) {
      const { done, value } = await reader.read();
      if (done) break;
      sample += decoder.decode(value, { stream: true });
      if (/<html[\s>]/i.test(sample)) return true;
    }
    return /<html[\s>]/i.test(sample);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Probe the exact validated tunnel origin. Redirects are refused, and no cookie or credential is sent. */
export async function probePublicTunnel(
  endpoint: string,
  fetcher: OnlineFetcher,
  signal: AbortSignal,
  report: (diagnostic: OnlineDiagnostic) => void,
  maxMs = 40_000,
): Promise<void> {
  if (quickTunnelEndpoint(endpoint) !== endpoint) throw new OnlineProbeError('INVALID_ENDPOINT');
  const started = Date.now();
  let attempts = 0;
  while (Date.now() - started < maxMs) {
    if (signal.aborted) throw new OnlineProbeError('CANCELLED');
    attempts += 1;
    let stage: OnlineStage = 'PUBLIC_READINESS';
    try {
      report({ stage, outcome: 'STARTED', elapsedMs: Date.now() - started, attempts });
      const ready = await request(fetcher, `${endpoint}/readyz`, signal);
      await ready.body?.cancel().catch(() => undefined);
      stage = 'PUBLIC_PAGE';
      report({ stage, outcome: 'STARTED', elapsedMs: Date.now() - started, attempts });
      const page = await request(fetcher, `${endpoint}/`, signal);
      if (!await hasHtml(page)) throw new OnlineProbeError('CONTENT');
      report({ stage, outcome: 'PASSED', elapsedMs: Date.now() - started, attempts });
      return;
    } catch (error) {
      const failure = error instanceof OnlineProbeError ? error : new OnlineProbeError(classifyNetworkException(error));
      const elapsedMs = Date.now() - started;
      const retry = failure.reason !== 'CANCELLED' && failure.reason !== 'REDIRECT'
        && failure.reason !== 'INVALID_ENDPOINT' && elapsedMs + 1_000 < maxMs;
      report({ stage, outcome: retry ? 'RETRYING' : 'FAILED', reason: failure.reason,
        ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }), elapsedMs, attempts });
      if (!retry) throw failure;
      try { await wait(1_000, signal); } catch {
        report({ stage, outcome: 'FAILED', reason: 'CANCELLED', elapsedMs: Date.now() - started, attempts });
        throw new OnlineProbeError('CANCELLED');
      }
    }
  }
  throw new OnlineProbeError('TIMEOUT');
}
