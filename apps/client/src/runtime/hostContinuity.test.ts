import { webcrypto } from 'node:crypto';

import { continuityMessage, HOST_CONTINUITY_VERSION, type HostContinuityProof } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';

import { verifyHostContinuity } from './hostContinuity';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const ROOM = 'OTB-ROOM23';
const NEW_LINK = 'https://new-host.trycloudflare.com';

/** A Host process: its own P-256 key pair, the public half as the resume ACK gives it. */
async function hostKey() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await subtle.exportKey('spki', pair.publicKey));
  return { privateKey: pair.privateKey, publicKey: Buffer.from(spki).toString('base64url') };
}

async function signProof(privateKey: CryptoKey, roomCode: string, endpoint: string, challenge: string): Promise<HostContinuityProof> {
  const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(continuityMessage(roomCode, endpoint, challenge)));
  return { version: HOST_CONTINUITY_VERSION, roomCode, endpoint, challenge, signature: Buffer.from(signature).toString('base64url') };
}

type Answer = (query: URLSearchParams) => Promise<Response> | Response;

/** A fetch that answers `/_otb/continuity` with `answer` and records what it was asked. */
function serving(answer: Answer) {
  const asked: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher = (async (input: string, init?: RequestInit) => {
    asked.push({ url: input, init });
    return answer(new URL(input).searchParams);
  }) as unknown as typeof fetch;
  return { asked, fetcher };
}

/** The honest Host: signs whatever fresh challenge it is given, for the address it was asked about. */
const honest = (privateKey: CryptoKey): Answer => async (query) => Response.json(
  await signProof(privateKey, query.get('code') ?? '', query.get('endpoint') ?? '', query.get('challenge') ?? ''),
);

describe('verifyHostContinuity (relink to a new Host address)', () => {
  it('accepts the same Host process at its new address and never sends a credential', async () => {
    const host = await hostKey();
    const { asked, fetcher } = serving(honest(host.privateKey));
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher, subtle })).toBe('SAME_HOST');
    expect(asked).toHaveLength(1);
    const url = new URL(asked[0].url);
    expect(url.origin + url.pathname).toBe(`${NEW_LINK}/_otb/continuity`);
    expect([...url.searchParams.keys()].sort()).toEqual(['challenge', 'code', 'endpoint']);
    expect(url.searchParams.get('challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(asked[0].init).toMatchObject({ credentials: 'omit', mode: 'cors', redirect: 'error' });
  });

  it('uses a fresh challenge for every check', async () => {
    const host = await hostKey();
    const { asked, fetcher } = serving(honest(host.privateKey));
    await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher, subtle });
    await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher, subtle });
    const challenges = asked.map(({ url }) => new URL(url).searchParams.get('challenge'));
    expect(challenges[0]).not.toBe(challenges[1]);
  });

  it('rejects the original attack: another Host with the same room code (and the same public id) cannot sign', async () => {
    const host = await hostKey();
    const attacker = await hostKey();
    // The old check trusted a public process id the attacker could copy; now the attacker can only sign with its own key.
    const { fetcher } = serving(honest(attacker.privateKey));
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher, subtle })).toBe('NOT_SAME_HOST');
  });

  it('rejects a replayed proof captured from an earlier check', async () => {
    const host = await hostKey();
    const recorded = await signProof(host.privateKey, ROOM, NEW_LINK, 'A'.repeat(43));
    const { fetcher } = serving(() => Response.json(recorded));
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher, subtle })).toBe('NOT_SAME_HOST');
  });

  it('rejects a proof made for another address (a relay) or another room, and an altered or invalid signature', async () => {
    const host = await hostKey();
    const otherAddress = serving(async (query) => Response.json(
      await signProof(host.privateKey, ROOM, 'http://192.168.1.15:43123', query.get('challenge') ?? ''),
    ));
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher: otherAddress.fetcher, subtle })).toBe('NOT_SAME_HOST');

    const otherRoom = serving(async (query) => Response.json(
      await signProof(host.privateKey, 'OTB-OTHER2', NEW_LINK, query.get('challenge') ?? ''),
    ));
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher: otherRoom.fetcher, subtle })).toBe('NOT_SAME_HOST');

    // A valid proof whose echoed room is rewritten: the signature no longer matches.
    const altered = serving(async (query) => {
      const proof = await signProof(host.privateKey, 'OTB-OTHER2', NEW_LINK, query.get('challenge') ?? '');
      return Response.json({ ...proof, roomCode: ROOM });
    });
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher: altered.fetcher, subtle })).toBe('NOT_SAME_HOST');

    const garbage = serving((query) => Response.json({
      version: HOST_CONTINUITY_VERSION, roomCode: ROOM, endpoint: NEW_LINK, challenge: query.get('challenge'), signature: 'AAAA',
    }));
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher: garbage.fetcher, subtle })).toBe('NOT_SAME_HOST');

    const wrongVersion = serving(async (query) => Response.json({
      ...await signProof(host.privateKey, ROOM, NEW_LINK, query.get('challenge') ?? ''), version: 'v0',
    }));
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher: wrongVersion.fetcher, subtle })).toBe('NOT_SAME_HOST');
  });

  it('tells a refusal from an address that does not answer', async () => {
    const host = await hostKey();
    for (const status of [403, 404]) {
      const { fetcher } = serving(() => new Response(null, { status }));
      expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher, subtle })).toBe('NOT_SAME_HOST');
    }
    for (const status of [429, 502, 503]) {
      const { fetcher } = serving(() => new Response(null, { status }));
      expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher, subtle })).toBe('UNREACHABLE');
    }
    const offline = serving(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher: offline.fetcher, subtle })).toBe('UNREACHABLE');
  });

  it('never accepts a late (expired) answer', async () => {
    const host = await hostKey();
    const { fetcher } = serving(() => new Promise<Response>(() => undefined));
    const slow = async (input: RequestInfo | URL, init?: RequestInit) => {
      const pending = fetcher(input, init);
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')));
        void pending.then(resolve);
      });
    };
    expect(await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher: slow, subtle, timeoutMs: 20 })).toBe('UNREACHABLE');
  });

  it('fails closed where the page cannot check signatures, and on a malformed pinned key', async () => {
    const host = await hostKey();
    const { asked, fetcher } = serving(honest(host.privateKey));
    // An insecure (`http://` LAN) page has `crypto.getRandomValues` but no `crypto.subtle`.
    const noCrypto = await (async () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }, configurable: true });
      try {
        return await verifyHostContinuity(NEW_LINK, ROOM, host.publicKey, { fetcher });
      } finally {
        if (original) Object.defineProperty(globalThis, 'crypto', original);
      }
    })();
    expect(noCrypto).toBe('UNSUPPORTED');
    asked.length = 0;
    expect(await verifyHostContinuity(NEW_LINK, ROOM, 'not a key!', { fetcher, subtle })).toBe('NOT_SAME_HOST');
    expect(await verifyHostContinuity(NEW_LINK, ROOM, Buffer.from('nope').toString('base64url'), { fetcher, subtle })).toBe('NOT_SAME_HOST');
    expect(asked).toHaveLength(1);
  });
});
