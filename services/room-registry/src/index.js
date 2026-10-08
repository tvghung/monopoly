// The Worker is a directory only. Every room code has its own strongly consistent
// SQLite-backed Durable Object; no gameplay state or reconnect credential is stored.
const CODE = /^[A-Z0-9-]{1,20}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const LEASE_MS = 90_000;
const RESERVATION_MS = 180_000;
const MAX_BODY = 1024;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function endpoint(value) {
  if (typeof value !== 'string' || value.length > 200) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      !/^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}

function bearer(request) {
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(authorization);
  return match ? match[1] : null;
}

async function body(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) return null;
  return smallJson(request);
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function smallJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY) { await reader.cancel(); return null; }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { return null; }
}

export class RoomLease {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY CHECK (id = 1), owner_hash TEXT NOT NULL, proof TEXT NOT NULL, endpoint TEXT, expires_at INTEGER NOT NULL)');
  }

  current() {
    return this.sql.exec('SELECT owner_hash, proof, endpoint, expires_at FROM lease WHERE id = 1').toArray()[0];
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code || !CODE.test(code)) return json({ error: 'INVALID_CODE' }, 400);
    const now = Date.now();
    if (request.method === 'GET') {
      const lease = this.current();
      if (!lease || lease.expires_at <= now || !lease.endpoint) return json({ error: 'NOT_FOUND' }, 404);
      return json({ roomCode: code, target: { kind: 'socket-io-https', endpoint: lease.endpoint }, expiresAt: lease.expires_at });
    }
    const owner = bearer(request);
    if (!owner || !TOKEN.test(owner)) return json({ error: 'UNAUTHORIZED' }, 401);
    const ownerHash = await digest(owner);
    const lease = this.current();
    if (request.method === 'POST' && url.pathname === '/reserve') {
      if (lease && lease.expires_at > now) return json({ error: 'CODE_TAKEN' }, 409);
      const proof = crypto.randomUUID();
      this.sql.exec('INSERT OR REPLACE INTO lease (id, owner_hash, proof, endpoint, expires_at) VALUES (1, ?, ?, NULL, ?)', ownerHash, proof, now + RESERVATION_MS);
      return json({ proof, expiresAt: now + RESERVATION_MS }, 201);
    }
    if (!lease || lease.expires_at <= now) return json({ error: 'NOT_FOUND' }, 404);
    if (lease.owner_hash !== ownerHash) return json({ error: 'FORBIDDEN' }, 403);
    if (request.method === 'DELETE') {
      this.sql.exec('DELETE FROM lease WHERE id = 1');
      return json({ ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/activate') {
      const payload = await body(request);
      const publicEndpoint = endpoint(payload?.endpoint);
      if (!publicEndpoint) return json({ error: 'INVALID_ENDPOINT' }, 400);
      // The reserved random proof is installed in this host's local HTTP server
      // before its tunnel starts. Another registrant cannot make that server
      // answer with their own reservation's proof.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4_000);
      let verified = false;
      try {
        const response = await fetch(`${publicEndpoint}/_otb/registry-proof`, {
          signal: controller.signal, redirect: 'error', headers: { accept: 'application/json' },
        });
        if (response.ok && Number(response.headers.get('content-length') || 0) < 1024) {
          const proofBody = await smallJson(response);
          verified = proofBody?.roomCode === code && proofBody?.proof === lease.proof;
        }
      } catch { /* Unreachable endpoints are never advertised. */ }
      finally { clearTimeout(timeout); }
      if (!verified) return json({ error: 'ENDPOINT_UNVERIFIED' }, 422);
      const latest = this.current();
      const activatedAt = Date.now();
      if (!latest || latest.expires_at <= activatedAt || latest.owner_hash !== ownerHash
        || latest.proof !== lease.proof) return json({ error: 'LEASE_CHANGED' }, 409);
      this.sql.exec('UPDATE lease SET endpoint = ?, expires_at = ? WHERE id = 1', publicEndpoint, activatedAt + LEASE_MS);
      return json({ expiresAt: activatedAt + LEASE_MS });
    }
    if (request.method === 'POST' && url.pathname === '/suspend') {
      this.sql.exec('UPDATE lease SET endpoint = NULL, expires_at = ? WHERE id = 1', now + RESERVATION_MS);
      return json({ ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/renew') {
      if (!lease.endpoint) return json({ error: 'NOT_ACTIVE' }, 409);
      this.sql.exec('UPDATE lease SET expires_at = ? WHERE id = 1', now + LEASE_MS);
      return json({ expiresAt: now + LEASE_MS });
    }
    return json({ error: 'NOT_FOUND' }, 404);
  }
}

export class RequestBudget {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK (id = 1), window_at INTEGER NOT NULL, reads INTEGER NOT NULL, writes INTEGER NOT NULL)');
  }
  async fetch(request) {
    const now = Date.now();
    const row = this.sql.exec('SELECT window_at, reads, writes FROM budget WHERE id = 1').toArray()[0];
    const current = row && row.window_at > now - 60_000 ? row : { window_at: now, reads: 0, writes: 0 };
    const write = new URL(request.url).searchParams.get('write') === '1';
    if (write ? current.writes >= 12 : current.reads >= 60) return new Response('', { status: 429 });
    this.sql.exec('INSERT OR REPLACE INTO budget (id, window_at, reads, writes) VALUES (1, ?, ?, ?)',
      current.window_at, current.reads + (write ? 0 : 1), current.writes + (write ? 1 : 0));
    return new Response(null, { status: 204 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz' && request.method === 'GET') return json({ ok: true });
    const match = /^\/v1\/rooms\/([A-Za-z0-9-]{1,20})(?:\/(reserve|activate|renew|suspend))?$/.exec(url.pathname);
    if (!match) return json({ error: 'NOT_FOUND' }, 404);
    const code = match[1].toUpperCase();
    if (!CODE.test(code)) return json({ error: 'INVALID_CODE' }, 400);
    const action = match[2];
    if (!(request.method === 'GET' && !action || request.method === 'DELETE' && !action ||
      request.method === 'POST' && action)) return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = await digest(ip);
    const budget = env.BUDGET.get(env.BUDGET.idFromName(ipHash));
    const allowance = await budget.fetch(new Request(`https://budget.internal/?write=${request.method === 'GET' ? '0' : '1'}`));
    if (allowance.status === 429) return json({ error: 'RATE_LIMITED' }, 429);
    // One object per code gives atomic reservation and collision handling.
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(new Request(`https://room.internal/${action || ''}?code=${code}`, request));
  },
};
