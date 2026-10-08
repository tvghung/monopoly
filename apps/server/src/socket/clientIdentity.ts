import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';
import type { ServerRuntimeProfile } from '../config';

const LOOPBACK_PEER = /^(?:127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/iu;

export function isLoopbackPeer(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK_PEER.test(address);
}

/**
 * Whether a loopback peer may name the visitor behind it. Only an Online Host
 * runs a managed cloudflared connector (it is launched with OTB_ONLINE_ROOM_CODE),
 * and that connector is the one local peer that forwards Internet visitors.
 * Cloudflare's edge sets CF-Connecting-IP to the visitor it saw and answers 403
 * (error 1000) to any request that arrives already carrying one, so the origin
 * never receives a visitor-chosen value. X-Forwarded-For (visitor-chosen entries
 * before Cloudflare's own) and True-Client-IP (passed through unchanged) are not
 * used for that reason.
 */
export function tunnelHeaderTrusted(
  profile: ServerRuntimeProfile,
  environment: NodeJS.ProcessEnv,
): boolean {
  return profile === 'desktop' && Boolean(environment.OTB_ONLINE_ROOM_CODE);
}

function networkKey(address: string): string {
  try {
    // IPv4-mapped IPv6 collapses to IPv4 and other IPv6 addresses to their /56,
    // so one household cannot mint unlimited keys from its prefix.
    return ipKeyGenerator(address);
  } catch {
    return address.toLowerCase();
  }
}

/**
 * The limiter key for one connection. The TCP peer is always authoritative:
 * a forwarding header is read only from the loopback peer of a trusted tunnel,
 * so a LAN device that sends the same header to the game port is still keyed by
 * its own address. Loopback traffic without a valid header (the Host's own
 * window, a local probe) shares the single `local` key.
 */
export function clientKey(
  peer: string | undefined,
  headers: IncomingHttpHeaders,
  trustTunnelHeader: boolean,
): string {
  if (!peer) return 'peer:unknown';
  if (!isLoopbackPeer(peer)) return `peer:${networkKey(peer)}`;
  if (trustTunnelHeader) {
    const visitor = headers['cf-connecting-ip'];
    if (typeof visitor === 'string' && isIP(visitor.trim()) !== 0) {
      return `visitor:${networkKey(visitor.trim())}`;
    }
  }
  return 'local';
}
