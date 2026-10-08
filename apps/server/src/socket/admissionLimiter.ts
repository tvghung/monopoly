export type AdmissionVerdict = 'ADMIT' | 'CLIENT_LIMIT' | 'GLOBAL_LIMIT';

export interface AdmissionLimiterOptions {
  windowMs: number;
  /** Admissions one client key may start per window (a household or school behind one public address shares it). */
  perClientLimit: number;
  /** Admissions the whole process starts per window, a backstop for floods spread over many clients. */
  globalLimit: number;
  /** Distinct client keys tracked at once; later keys share a single overflow bucket instead of growing the table. */
  maxClients: number;
  now?: () => number;
}

/** One window of room admissions: a four-player lobby fits many times over, a single abusive client does not. */
export const ADMISSION_LIMITS = {
  windowMs: 60_000,
  perClientLimit: 30,
  globalLimit: 600,
  maxClients: 1_024,
} as const satisfies AdmissionLimiterOptions;

const OVERFLOW_CLIENT = 'overflow';
const SWEEP_INTERVAL_MS = 1_000;

function dropExpired(attempts: number[], cutoff: number): void {
  let expired = 0;
  while (expired < attempts.length && attempts[expired] <= cutoff) expired += 1;
  if (expired > 0) attempts.splice(0, expired);
}

/**
 * Sliding-window limiter for the unauthenticated room-admission step. State is
 * bounded: at most `globalLimit` timestamps in total, `perClientLimit` per
 * client key, and `maxClients` (+ one overflow bucket) keys. Only admitted
 * attempts are recorded, so a throttled client regains capacity as its own
 * window drains and cannot extend a block by retrying.
 */
export class AdmissionLimiter {
  private readonly clients = new Map<string, number[]>();
  private readonly processWide: number[] = [];
  private readonly now: () => number;
  private lastSweepAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: AdmissionLimiterOptions = ADMISSION_LIMITS) {
    this.now = options.now ?? Date.now;
  }

  /** Number of client keys currently tracked, including the overflow bucket. */
  get trackedClients(): number {
    return this.clients.size;
  }

  attempt(client: string): AdmissionVerdict {
    const now = this.now();
    const cutoff = now - this.options.windowMs;
    this.sweepIfDue(now, cutoff);

    const key = this.clients.has(client) || this.clients.size < this.options.maxClients
      ? client
      : OVERFLOW_CLIENT;
    const attempts = this.clients.get(key) ?? [];
    dropExpired(attempts, cutoff);
    if (attempts.length >= this.options.perClientLimit) return 'CLIENT_LIMIT';
    dropExpired(this.processWide, cutoff);
    if (this.processWide.length >= this.options.globalLimit) return 'GLOBAL_LIMIT';
    attempts.push(now);
    this.processWide.push(now);
    this.clients.set(key, attempts);
    return 'ADMIT';
  }

  /** Forget clients whose attempts have all left the window. Runs lazily, at most once per interval. */
  private sweepIfDue(now: number, cutoff: number): void {
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;
    for (const [client, attempts] of this.clients) {
      dropExpired(attempts, cutoff);
      if (attempts.length === 0) this.clients.delete(client);
    }
  }
}
