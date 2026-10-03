import dgram from 'node:dgram';
import os from 'node:os';

export type NetworkInterfacePreference = 'preferred' | 'fallback';

export interface NetworkInterfaceCandidate {
  name: string;
  displayName: string;
  address: string;
  netmask: string;
  preference: NetworkInterfacePreference;
  rank: number;
}

type InterfaceProvider = () => NodeJS.Dict<os.NetworkInterfaceInfo[] | undefined>;

/** TEST-NET-3 (RFC 5737): never routed, so a UDP connect to it only asks the OS which local address the default route uses. */
const DEFAULT_ROUTE_PROBE_ADDRESS = '203.0.113.1';
const DEFAULT_ROUTE_PROBE_PORT = 9;
const DEFAULT_ROUTE_PROBE_TIMEOUT_MS = 500;

/**
 * Adapter names that are almost never the network the other players are on: hypervisor and container bridges, VPN and
 * tunnel adapters, and personal-area links. They rank last, but stay available when nothing else exists.
 */
const VIRTUAL_INTERFACE_NAME = new RegExp([
  'vpn', 'virtual', 'docker', 'vmware', 'vmnet', 'vnic', 'virtualbox', 'vbox', 'hyper-v', 'vethernet', 'veth', 'virbr',
  'wsl', 'tun', 'tap', 'bridge', 'tailscale', 'zerotier', 'hamachi', 'wireguard', 'wg', 'warp', 'utun', 'ppp', 'npcap',
  'bluetooth',
].join('|'), 'u');

function ipv4Parts(value: string): number[] | undefined {
  const parts = value.split('.').map(Number);
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : undefined;
}

export function isUsableLanIPv4(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = ipv4Parts(value);
  if (!parts) return false;
  const [first, second] = parts;
  return value !== '0.0.0.0' && first !== 127 && !(first === 169 && second === 254);
}

/** RFC 1918 private ranges: 10/8, 172.16/12 and 192.168/16. */
export function isPrivateIPv4(value: string): boolean {
  const parts = ipv4Parts(value);
  if (!parts) return false;
  const [first, second] = parts;
  return first === 10 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168;
}

/** Carrier-grade NAT space (100.64.0.0/10), which VPN overlays such as Tailscale also use. */
function isCarrierGradeNat(value: string): boolean {
  const parts = ipv4Parts(value);
  if (!parts) return false;
  const [first, second] = parts;
  return first === 100 && second >= 64 && second <= 127;
}

function compareIPv4(left: string, right: string): number {
  const leftParts = ipv4Parts(left);
  const rightParts = ipv4Parts(right);
  if (!leftParts || !rightParts) return left.localeCompare(right);
  for (let index = 0; index < 4; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The directed broadcast address of a subnet (`address | ~netmask`), or undefined for a malformed address or mask. */
export function broadcastAddress(address: string, netmask: string): string | undefined {
  const addressParts = ipv4Parts(address);
  const maskParts = ipv4Parts(netmask);
  if (!addressParts || !maskParts) return undefined;
  return addressParts.map((part, index) => String((part & maskParts[index]) | (255 ^ maskParts[index]))).join('.');
}

/** Whether `candidate` lies in the same subnet as `address` under `netmask`. */
export function isInSameSubnet(candidate: string, address: string, netmask: string): boolean {
  const candidateParts = ipv4Parts(candidate);
  const addressParts = ipv4Parts(address);
  const maskParts = ipv4Parts(netmask);
  if (!candidateParts || !addressParts || !maskParts) return false;
  return maskParts.every((mask, index) => (candidateParts[index] & mask) === (addressParts[index] & mask));
}

function interfaceRank(name: string, address: string): number {
  const normalized = name.toLowerCase();
  if (isCarrierGradeNat(address) || VIRTUAL_INTERFACE_NAME.test(normalized)) return 3;
  if (/wi[- ]?fi|wireless|airport|wlan/u.test(normalized)) return 0;
  if (/ethernet|^en\d|^eth\d|lan/u.test(normalized)) return 1;
  return 2;
}

function displayName(name: string, rank: number): string {
  if (rank === 0) return 'Wi-Fi';
  if (rank === 1) return 'Ethernet';
  return name;
}

/**
 * The usable IPv4 interfaces, best first: the interface that carries the default route (when it is a real Wi-Fi or
 * Ethernet adapter), then by rank, then RFC 1918 addresses before others, then numerically by address. A /32 address is
 * a point-to-point endpoint without neighbours and is dropped. The order is deterministic for the same input.
 *
 * `defaultRouteAddress` comes from `probeDefaultRouteAddress`; it is a parameter so this function stays synchronous.
 */
export function resolveNetworkInterfaces(
  provider: InterfaceProvider = () => os.networkInterfaces(),
  defaultRouteAddress?: string,
): NetworkInterfaceCandidate[] {
  const candidates: NetworkInterfaceCandidate[] = [];
  for (const [name, entries] of Object.entries(provider())) {
    if (!entries) continue;
    for (const entry of entries) {
      const family = (entry as unknown as { family: string | number }).family;
      if (family !== 'IPv4' && family !== 4) continue;
      if (entry.internal || !isUsableLanIPv4(entry.address)) continue;
      if (entry.netmask === '255.255.255.255') continue;
      const rank = interfaceRank(name, entry.address);
      candidates.push({
        name,
        displayName: displayName(name, rank),
        address: entry.address,
        netmask: entry.netmask,
        preference: rank <= 1 ? 'preferred' : 'fallback',
        rank,
      });
    }
  }

  const boosted = (candidate: NetworkInterfaceCandidate): number => (
    candidate.address === defaultRouteAddress && candidate.rank <= 2 ? 0 : 1
  );
  return candidates
    .sort((left, right) => (
      boosted(left) - boosted(right)
      || left.rank - right.rank
      || Number(!isPrivateIPv4(left.address)) - Number(!isPrivateIPv4(right.address))
      || compareIPv4(left.address, right.address)
      || left.name.localeCompare(right.name)
    ))
    .filter((candidate, index, all) => (
      index === all.findIndex(other => other.address === candidate.address)
    ));
}

export function advertisedEndpoints(
  candidates: readonly NetworkInterfaceCandidate[],
  port: number,
): string[] {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Game port must be between 1 and 65535');
  }
  return [...new Set(candidates.map(candidate => `http://${candidate.address}:${String(port)}`))];
}

interface RouteProbeSocket {
  on(event: 'error', listener: (error: Error) => void): unknown;
  connect(port: number, address: string, callback?: () => void): unknown;
  address(): { address: string };
  close(): unknown;
}

/**
 * The local IPv4 address the OS would use to reach the Internet, or undefined when there is no default route. A UDP
 * `connect` only selects a route and a source address: no packet is sent.
 */
export function probeDefaultRouteAddress(
  createSocket: () => RouteProbeSocket = () => dgram.createSocket('udp4'),
  timeoutMs = DEFAULT_ROUTE_PROBE_TIMEOUT_MS,
): Promise<string | undefined> {
  return new Promise(resolve => {
    let socket: RouteProbeSocket | undefined;
    let timer: NodeJS.Timeout | undefined;
    let settled = false;
    const finish = (address?: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // The probe socket may already be closed after a failed connect.
      }
      resolve(isUsableLanIPv4(address) ? address : undefined);
    };
    try {
      socket = createSocket();
      // A permanent listener: a socket error after the probe finished must never become an uncaught exception.
      socket.on('error', () => finish());
      timer = setTimeout(() => finish(), timeoutMs);
      socket.connect(DEFAULT_ROUTE_PROBE_PORT, DEFAULT_ROUTE_PROBE_ADDRESS, () => {
        try {
          finish(socket?.address().address);
        } catch {
          finish();
        }
      });
    } catch {
      finish();
    }
  });
}
