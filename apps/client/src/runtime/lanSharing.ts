import { roomCodeSchema } from '@monopoly/shared';
import { normalizeLanEndpoint } from './lanEndpoint';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateHostRoomCode(random = globalThis.crypto): string {
  const bytes = new Uint8Array(6);
  random.getRandomValues(bytes);
  return `OTB-${[...bytes].map(byte => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('')}`;
}

export function normalizeRoomCode(value: unknown): string | undefined {
  const parsed = roomCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function buildLanJoinUrl(endpoint: string, roomCode: string): string {
  const normalizedEndpoint = normalizeLanEndpoint(endpoint);
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!normalizedEndpoint || !normalizedRoomCode) throw new Error('Invalid LAN join link');
  const url = new URL(normalizedEndpoint);
  url.searchParams.set('room', normalizedRoomCode);
  return url.toString();
}

export interface LanJoinLink {
  /** `http://<ipv4>:<port>`, the Host as `normalizeLanEndpoint` accepts it. */
  endpoint: string;
  /** Canonical (upper-case) room code. */
  roomCode: string;
}

const MAX_LAN_JOIN_LINK_LENGTH = 300;

/**
 * The inverse of `buildLanJoinUrl`: the Host endpoint and the room code of an invitation link
 * (`http://<ipv4>:<port>/?room=<CODE>`), or undefined for anything else. The scheme may be left out. Only the address,
 * the port and the `room` value are read: every other query value and the fragment are ignored, and a link that
 * carries credentials is refused. Nothing in a link is a credential for the room.
 */
export function parseLanJoinUrl(value: string): LanJoinLink | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LAN_JOIN_LINK_LENGTH) return undefined;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/') return undefined;
  const endpoint = normalizeLanEndpoint(`http://${url.host}`);
  const roomCode = normalizeRoomCode(url.searchParams.get('room'));
  return endpoint && roomCode ? { endpoint, roomCode } : undefined;
}

export function roomCodeFromLocation(
  location: Pick<Location, 'search'> = window.location,
): string | undefined {
  return normalizeRoomCode(new URLSearchParams(location.search).get('room'));
}
