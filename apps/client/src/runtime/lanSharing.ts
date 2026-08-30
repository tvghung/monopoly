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

export function roomCodeFromLocation(
  location: Pick<Location, 'search'> = window.location,
): string | undefined {
  return normalizeRoomCode(new URLSearchParams(location.search).get('room'));
}
