import { continuityMessage, HOST_CONTINUITY_VERSION } from '@monopoly/shared';

/**
 * Whether the Host process this seat was resumed on answers at `endpoint` (see `packages/shared/src/hostContinuity.ts`):
 * - `SAME_HOST`: it signed this fresh challenge, for this room and this exact address, with the key pinned from the resume ACK;
 * - `NOT_SAME_HOST`: the address answered, but without a valid proof (another Host, a replayed or altered answer, no such room);
 * - `UNREACHABLE`: no answer (yet), so the player can try again;
 * - `UNSUPPORTED`: this page cannot check signatures (no WebCrypto, e.g. an `http://` LAN page), so it never trusts the link.
 * The reconnect token never leaves this device during the check.
 */
export type HostContinuityOutcome = 'SAME_HOST' | 'NOT_SAME_HOST' | 'UNREACHABLE' | 'UNSUPPORTED';

export interface HostContinuityDeps {
  fetcher?: typeof fetch;
  subtle?: SubtleCrypto;
  randomBytes?: (length: number) => Uint8Array;
  timeoutMs?: number;
}

const base64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
  .replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');

function fromBase64url(value: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return undefined;
  try {
    const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return undefined;
  }
}

function originOf(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).origin;
  } catch {
    return undefined;
  }
}

export async function verifyHostContinuity(
  endpoint: string,
  roomCode: string,
  pinnedKey: string,
  deps: HostContinuityDeps = {},
): Promise<HostContinuityOutcome> {
  const subtle = deps.subtle ?? globalThis.crypto?.subtle;
  if (!subtle) return 'UNSUPPORTED';
  const origin = originOf(endpoint);
  const keyBytes = fromBase64url(pinnedKey);
  if (!origin || !keyBytes) return 'NOT_SAME_HOST';
  const challenge = base64url(deps.randomBytes?.(32) ?? globalThis.crypto.getRandomValues(new Uint8Array(32)));
  const fetcher = deps.fetcher ?? ((input, init) => fetch(input, init));
  const query = new URLSearchParams({ code: roomCode, challenge, endpoint: origin });
  let body: unknown;
  try {
    const response = await fetcher(`${origin}/_otb/continuity?${query.toString()}`, {
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      // The challenge is single-use and lives only as long as this request: a late answer is never accepted.
      signal: AbortSignal.timeout(deps.timeoutMs ?? 5_000),
    });
    // The address answered but refused (not its own address, no such room): not the Host of this game.
    if (response.status === 403 || response.status === 404) return 'NOT_SAME_HOST';
    if (!response.ok) return 'UNREACHABLE';
    body = await response.json();
  } catch {
    return 'UNREACHABLE';
  }
  const proof = body as Record<string, unknown> | null;
  if (
    !proof
    || proof.version !== HOST_CONTINUITY_VERSION
    || proof.roomCode !== roomCode
    || proof.endpoint !== origin
    || proof.challenge !== challenge
    || typeof proof.signature !== 'string'
  ) return 'NOT_SAME_HOST';
  const signature = fromBase64url(proof.signature);
  if (!signature) return 'NOT_SAME_HOST';
  try {
    const key = await subtle.importKey('spki', keyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      new TextEncoder().encode(continuityMessage(roomCode, origin, challenge)),
    );
    return valid ? 'SAME_HOST' : 'NOT_SAME_HOST';
  } catch {
    return 'NOT_SAME_HOST';
  }
}
