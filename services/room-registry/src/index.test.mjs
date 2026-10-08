import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker, { RequestBudget, RoomLease } from './index.js';

function objectState() {
  const db = new DatabaseSync(':memory:');
  return { storage: { sql: { exec(statement, ...args) {
    const prepared = db.prepare(statement);
    const rows = prepared.columns().length ? prepared.all(...args) : (prepared.run(...args), []);
    return { toArray: () => rows };
  } } } };
}

function environment() {
  const rooms = new Map();
  const budgets = new Map();
  return {
    ROOMS: {
      idFromName: value => value,
      get(id) {
        if (!rooms.has(id)) rooms.set(id, new RoomLease(objectState()));
        return rooms.get(id);
      },
    },
    BUDGET: {
      idFromName: value => value,
      get(id) {
        if (!budgets.has(id)) budgets.set(id, new RequestBudget(objectState()));
        return budgets.get(id);
      },
    },
  };
}

test('reservation is exclusive; activation verifies host control; owner alone can renew or revoke', async () => {
  const env = environment();
  const code = 'OTB-ABC234';
  const credential = randomBytes(32).toString('base64url');
  const impostor = randomBytes(32).toString('base64url');
  const url = `https://registry.test/v1/rooms/${code}`;
  const request = (path, method, token, body) => worker.fetch(new Request(url + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);

  const reserved = await request('/reserve', 'POST', credential);
  assert.equal(reserved.status, 201);
  const { proof } = await reserved.json();
  assert.equal((await request('/reserve', 'POST', impostor)).status, 409);
  assert.equal((await request('', 'GET')).status, 404);
  assert.equal((await request('/activate', 'POST', impostor, { endpoint: 'https://host.trycloudflare.com' })).status, 403);
  assert.equal((await request('/activate', 'POST', credential, { endpoint: 'https://host.trycloudflare.com.evil.test' })).status, 400);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ roomCode: code, proof }), {
    headers: { 'content-type': 'application/json' },
  });
  try {
    assert.equal((await request('/activate', 'POST', credential, { endpoint: 'https://host.trycloudflare.com' })).status, 200);
    const found = await (await request('', 'GET')).json();
    assert.equal(found.target.endpoint, 'https://host.trycloudflare.com');
    assert.equal((await request('/renew', 'POST', impostor)).status, 403);
    assert.equal((await request('/renew', 'POST', credential)).status, 200);
    assert.equal((await request('', 'DELETE', impostor)).status, 403);
    assert.equal((await request('', 'DELETE', credential)).status, 200);
    assert.equal((await request('', 'GET')).status, 404);
  } finally { globalThis.fetch = originalFetch; }
});

test('a revoked reservation cannot be activated after endpoint verification yields', async () => {
  const env = environment();
  const code = 'OTB-RACE24';
  const credential = randomBytes(32).toString('base64url');
  const replacement = randomBytes(32).toString('base64url');
  const url = `https://registry.test/v1/rooms/${code}`;
  const request = (path, method, token, payload) => worker.fetch(new Request(url + path, {
    method,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  }), env);
  const { proof } = await (await request('/reserve', 'POST', credential)).json();
  let verificationStarted;
  const entered = new Promise(resolve => { verificationStarted = resolve; });
  let finishVerification;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    verificationStarted();
    return new Promise(resolve => { finishVerification = resolve; });
  };
  try {
    const activating = request('/activate', 'POST', credential, { endpoint: 'https://host.trycloudflare.com' });
    await entered;
    assert.equal((await request('', 'DELETE', credential)).status, 200);
    assert.equal((await request('/reserve', 'POST', replacement)).status, 201);
    finishVerification(new Response(JSON.stringify({ roomCode: code, proof })));
    assert.equal((await activating).status, 409);
    assert.equal((await request('', 'GET', replacement)).status, 404);
  } finally { globalThis.fetch = originalFetch; }
});

test('expired reservations release a code and expired active rooms stop resolving', async () => {
  const env = environment();
  const code = 'OTB-EXPIRE';
  const first = randomBytes(32).toString('base64url');
  const second = randomBytes(32).toString('base64url');
  const url = `https://registry.test/v1/rooms/${code}`;
  const request = (path, method, token, payload) => worker.fetch(new Request(url + path, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  }), env);
  const realNow = Date.now;
  const realFetch = globalThis.fetch;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    assert.equal((await request('/reserve', 'POST', first)).status, 201);
    now += 180_001;
    const reservation = await request('/reserve', 'POST', second);
    assert.equal(reservation.status, 201);
    const { proof } = await reservation.json();
    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ roomCode: code, proof })));
    assert.equal((await request('/activate', 'POST', second, { endpoint: 'https://host.trycloudflare.com' })).status, 200);
    assert.equal((await request('', 'GET')).status, 200);
    now += 90_001;
    assert.equal((await request('', 'GET')).status, 404);
  } finally {
    Date.now = realNow;
    globalThis.fetch = realFetch;
  }
});
