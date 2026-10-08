import { normalizeRoomCode, parseLanJoinUrl } from './lanSharing';

export type JoinInput =
  | { kind: 'code'; roomCode: string }
  | { kind: 'invitation'; roomCode: string; endpoint: string }
  | { kind: 'invalid'; reason: 'CODE' | 'INVITATION' };

export function publicHttpsEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname)
      && !url.port && !url.username && !url.password && url.pathname === '/'
      && !url.search && !url.hash ? url.origin : undefined;
  } catch { return undefined; }
}

export function parseJoinInput(value: string): JoinInput {
  const trimmed = value.trim();
  if (trimmed.length > 500) return { kind: 'invalid', reason: 'INVITATION' };
  if (trimmed.includes('://') || trimmed.includes('/') || trimmed.includes('?') || trimmed.includes('.')) {
    const lan = parseLanJoinUrl(trimmed);
    if (lan) return { kind: 'invitation', ...lan };
    try {
      const url = new URL(trimmed);
      const endpoint = publicHttpsEndpoint(url.origin);
      const room = url.searchParams.getAll('room');
      const roomCode = room.length === 1 ? normalizeRoomCode(room[0]) : undefined;
      if (endpoint && url.pathname === '/' && !url.username && !url.password
        && !url.hash && url.searchParams.size === 1 && roomCode) {
        return { kind: 'invitation', endpoint, roomCode };
      }
    } catch { /* Invalid link. */ }
    return { kind: 'invalid', reason: 'INVITATION' };
  }
  const roomCode = normalizeRoomCode(trimmed);
  return roomCode ? { kind: 'code', roomCode } : { kind: 'invalid', reason: 'CODE' };
}
