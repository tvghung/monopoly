import os from 'node:os';

export type NetworkInterfacePreference = 'preferred' | 'fallback';

export interface NetworkInterfaceCandidate {
  name: string;
  displayName: string;
  address: string;
  netmask: string;
  broadcast: string;
  preference: NetworkInterfacePreference;
  rank: number;
}

type InterfaceProvider = () => NodeJS.Dict<os.NetworkInterfaceInfo[] | undefined>;

function ipv4Parts(value: string): number[] | undefined {
  const parts = value.split('.').map(Number);
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : undefined;
}

export function isPrivateIPv4(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = ipv4Parts(value);
  if (!parts) return false;
  const [first, second] = parts;
  if (first === 10 || first === 192 && second === 168) return true;
  return first === 172 && second >= 16 && second <= 31;
}

function broadcastAddress(address: string, netmask: string): string {
  const addressParts = ipv4Parts(address);
  const maskParts = ipv4Parts(netmask);
  if (!addressParts || !maskParts) return address;
  return addressParts.map((part, index) => (
    String((part & maskParts[index]) | (255 ^ maskParts[index]))
  )).join('.');
}

function interfaceRank(name: string): number {
  const normalized = name.toLowerCase();
  if (/vpn|virtual|docker|vmware|virtualbox|hyper-v|vethernet|tun|tap|bridge/u.test(normalized)) {
    return 3;
  }
  if (/wi[- ]?fi|wireless|airport|wlan/u.test(normalized)) return 0;
  if (/ethernet|^en\d|^eth\d|lan/u.test(normalized)) return 1;
  return 2;
}

function displayName(name: string, rank: number): string {
  if (rank === 0) return 'Wi-Fi';
  if (rank === 1) return 'Ethernet';
  return name;
}

export function resolveNetworkInterfaces(
  provider: InterfaceProvider = () => os.networkInterfaces(),
): NetworkInterfaceCandidate[] {
  const candidates: NetworkInterfaceCandidate[] = [];
  for (const [name, entries] of Object.entries(provider())) {
    if (!entries) continue;
    for (const entry of entries) {
      const family = (entry as unknown as { family: string | number }).family;
      if (family !== 'IPv4' && family !== 4) continue;
      if (entry.internal || !isPrivateIPv4(entry.address)) continue;
      const rank = interfaceRank(name);
      candidates.push({
        name,
        displayName: displayName(name, rank),
        address: entry.address,
        netmask: entry.netmask,
        broadcast: broadcastAddress(entry.address, entry.netmask),
        preference: rank <= 1 ? 'preferred' : 'fallback',
        rank,
      });
    }
  }

  return candidates
    .sort((left, right) => (
      left.rank - right.rank
      || left.address.localeCompare(right.address)
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
  return [...new Set(candidates.map(candidate => `http://${candidate.address}:${String(port)}`))];
}
