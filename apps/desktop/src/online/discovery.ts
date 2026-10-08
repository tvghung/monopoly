import { randomBytes } from 'node:crypto';
import { quickTunnelEndpoint } from './connectivity';

export interface RoomDiscoveryProvider {
  reserve(roomCode: string): Promise<{ credential: string; proof: string }>;
  activate(roomCode: string, credential: string, endpoint: string): Promise<void>;
  renew(roomCode: string, credential: string): Promise<void>;
  suspend(roomCode: string, credential: string): Promise<void>;
  revoke(roomCode: string, credential: string): Promise<void>;
  resolve(roomCode: string): Promise<string | null>;
}

export function registryBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    url.pathname !== '/' || url.search || url.hash || !url.hostname.includes('.')) {
    throw new Error('REGISTRY_CONFIG_INVALID');
  }
  return url.origin;
}

export class HttpRoomDiscovery implements RoomDiscoveryProvider {
  private readonly base: string;
  constructor(base: string, private readonly fetcher: typeof fetch = fetch) {
    this.base = registryBaseUrl(base);
  }

  private async request(code: string, method: string, action = '', credential?: string, payload?: object): Promise<Response> {
    if (!/^[A-Z0-9-]{1,20}$/.test(code)) throw new Error('INVALID_CODE');
    const response = await this.fetcher(`${this.base}/v1/rooms/${encodeURIComponent(code)}${action}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(5_000),
      headers: { ...(credential ? { authorization: `Bearer ${credential}` } : {}),
        ...(payload ? { 'content-type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return response;
  }

  async reserve(roomCode: string): Promise<{ credential: string; proof: string }> {
    const credential = randomBytes(32).toString('base64url');
    const response = await this.request(roomCode, 'POST', '/reserve', credential);
    if (response.status === 409) throw new Error('CODE_TAKEN');
    if (response.status !== 201) throw new Error('REGISTRY_UNAVAILABLE');
    const body = await response.json() as { proof?: unknown };
    if (typeof body.proof !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.proof)) throw new Error('REGISTRY_INVALID_RESPONSE');
    return { credential, proof: body.proof };
  }

  async activate(roomCode: string, credential: string, endpoint: string): Promise<void> {
    const response = await this.request(roomCode, 'POST', '/activate', credential, { endpoint });
    if (!response.ok) throw new Error('REGISTRY_ACTIVATION_FAILED');
  }

  async renew(roomCode: string, credential: string): Promise<void> {
    const response = await this.request(roomCode, 'POST', '/renew', credential);
    if (!response.ok) throw new Error('REGISTRY_RENEW_FAILED');
  }

  async suspend(roomCode: string, credential: string): Promise<void> {
    const response = await this.request(roomCode, 'POST', '/suspend', credential);
    if (!response.ok) throw new Error('REGISTRY_SUSPEND_FAILED');
  }

  async revoke(roomCode: string, credential: string): Promise<void> {
    await this.request(roomCode, 'DELETE', '', credential);
  }

  async resolve(roomCode: string): Promise<string | null> {
    const response = await this.request(roomCode, 'GET');
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('REGISTRY_UNAVAILABLE');
    const body = await response.json() as { roomCode?: unknown; target?: { kind?: unknown; endpoint?: unknown } };
    const endpoint = typeof body.target?.endpoint === 'string'
      ? quickTunnelEndpoint(body.target.endpoint) : undefined;
    if (body.roomCode !== roomCode || body.target?.kind !== 'socket-io-https' || !endpoint) {
      throw new Error('REGISTRY_INVALID_RESPONSE');
    }
    return endpoint;
  }
}
