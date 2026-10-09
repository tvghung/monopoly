import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { continuityMessage, publicEndpointOrigin } from '@monopoly/shared';

type InterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

/**
 * This server process's continuity identity (see `packages/shared/src/hostContinuity.ts`): a P-256 key pair that exists only
 * in RAM, and the addresses this process answers at. A restart creates a new key, so continuity never crosses processes.
 */
export class HostContinuity {
  /** base64url SPKI DER of the public key, given to players in the resume ACK. */
  readonly publicKey: string;

  private readonly privateKey: KeyObject;

  private publicEndpoints = new Set<string>();

  constructor(private readonly interfaces: () => InterfaceMap = networkInterfaces) {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
  }

  /** The public addresses Electron main opened for this process (its current tunnel). Anything not a valid origin is dropped. */
  setPublicEndpoints(endpoints: readonly unknown[]): void {
    this.publicEndpoints = new Set(endpoints
      .map((value) => (typeof value === 'string' ? publicEndpointOrigin(value) : undefined))
      .filter((value): value is string => value !== undefined));
  }

  /**
   * Whether `endpoint` is an address of this process: its published tunnel origin, or `http://<own IPv4>:<listening port>`
   * (the LAN addresses come from this machine's own interfaces, never from the request).
   */
  ownsEndpoint(endpoint: string, listeningPort: number): boolean {
    if (this.publicEndpoints.has(endpoint)) return true;
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return false;
    }
    if (url.protocol !== 'http:' || url.origin !== endpoint || url.port !== String(listeningPort)) return false;
    const ownAddresses = new Set(['127.0.0.1']);
    for (const entries of Object.values(this.interfaces())) {
      for (const entry of entries ?? []) {
        if (entry.family === 'IPv4') ownAddresses.add(entry.address);
      }
    }
    return ownAddresses.has(url.hostname);
  }

  /** The base64url signature of the continuity message for this room, address and challenge. */
  sign(roomCode: string, endpoint: string, challenge: string): string {
    return sign('sha256', Buffer.from(continuityMessage(roomCode, endpoint, challenge), 'utf8'), {
      key: this.privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
  }
}
