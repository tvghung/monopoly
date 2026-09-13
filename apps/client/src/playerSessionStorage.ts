import { reconnectTokenSchema, roomCodeSchema } from '@monopoly/shared';

const LEGACY_PLAYER_SESSION_STORAGE_KEY = 'monopoly.player-session.v1';
const LEGACY_PLAYER_SESSION_STORAGE_V2_KEY = 'monopoly.player-session.v2';
const PLAYER_SESSION_STORAGE_VERSION = 3 as const;
const PLAYER_SESSION_MAX_AUTHORITIES = 8;

export const PLAYER_SESSION_STORAGE_KEY = 'monopoly.player-session.v3';

interface StoredPlayerSession {
  token: string;
  roomCode: string | null;
}

interface StoredPlayerSessions {
  version: typeof PLAYER_SESSION_STORAGE_VERSION;
  sessions: Record<string, StoredPlayerSession>;
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): SessionStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function normalizeAuthority(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeRoomCode(value: unknown): string | null | undefined {
  if (value === null) return null;
  const parsed = roomCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function emptyStoredSessions(): StoredPlayerSessions {
  return { version: PLAYER_SESSION_STORAGE_VERSION, sessions: {} };
}

function storeSession(
  stored: StoredPlayerSessions,
  authority: string,
  session: StoredPlayerSession,
): void {
  delete stored.sessions[authority];
  stored.sessions[authority] = session;
  limitAuthorities(stored);
}

function serializeLegacyV2Sessions(sessions: Record<string, StoredPlayerSession>): string {
  return JSON.stringify({
    version: 2,
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([authority, session]) => [authority, session.token]),
    ),
  });
}

function limitAuthorities(stored: StoredPlayerSessions): void {
  const authorities = Object.keys(stored.sessions);
  for (const oldAuthority of authorities.slice(
    0,
    Math.max(0, authorities.length - PLAYER_SESSION_MAX_AUTHORITIES),
  )) {
    delete stored.sessions[oldAuthority];
  }
}

function parseStoredSession(value: unknown): StoredPlayerSession | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as { token?: unknown; roomCode?: unknown };
  const token = reconnectTokenSchema.safeParse(candidate.token);
  const roomCode = normalizeRoomCode(candidate.roomCode);
  if (!token.success || roomCode === undefined) return undefined;
  return { token: token.data, roomCode };
}

function readStoredSessions(storage: SessionStorage): StoredPlayerSessions {
  try {
    const raw = storage.getItem(PLAYER_SESSION_STORAGE_KEY);
    if (!raw) return emptyStoredSessions();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid session record');
    }
    const candidate = parsed as Partial<StoredPlayerSessions>;
    if (candidate.version !== PLAYER_SESSION_STORAGE_VERSION
      || !candidate.sessions
      || typeof candidate.sessions !== 'object'
      || Array.isArray(candidate.sessions)) {
      throw new Error('invalid session record');
    }
    const sessions: Record<string, StoredPlayerSession> = {};
    for (const [authority, value] of Object.entries(candidate.sessions)) {
      if (normalizeAuthority(authority) !== authority) continue;
      const session = parseStoredSession(value);
      if (session) sessions[authority] = session;
    }
    return { version: PLAYER_SESSION_STORAGE_VERSION, sessions };
  } catch {
    return emptyStoredSessions();
  }
}

function readLegacyV2Sessions(storage: SessionStorage): Record<string, StoredPlayerSession> {
  try {
    const raw = storage.getItem(LEGACY_PLAYER_SESSION_STORAGE_V2_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const candidate = parsed as { version?: unknown; sessions?: unknown };
    if (candidate.version !== 2
      || !candidate.sessions
      || typeof candidate.sessions !== 'object'
      || Array.isArray(candidate.sessions)) return {};
    const sessions: Record<string, StoredPlayerSession> = {};
    for (const [authority, token] of Object.entries(candidate.sessions)) {
      if (normalizeAuthority(authority) !== authority) continue;
      const parsedToken = reconnectTokenSchema.safeParse(token);
      if (parsedToken.success) sessions[authority] = { token: parsedToken.data, roomCode: null };
    }
    return sessions;
  } catch {
    return {};
  }
}

function readLegacyToken(storage: SessionStorage): string | null {
  if (typeof window !== 'undefined' && window.location.protocol === 'app:') return null;
  try {
    const raw = storage.getItem(LEGACY_PLAYER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const candidate = parsed as { version?: unknown; token?: unknown };
    const result = reconnectTokenSchema.safeParse(candidate.version === 1 ? candidate.token : null);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function persistSessions(storage: SessionStorage, sessions: StoredPlayerSessions): boolean {
  try {
    storage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch {
    return false;
  }
}

function migrateSession(
  storage: SessionStorage,
  stored: StoredPlayerSessions,
  authority: string,
  session: StoredPlayerSession,
  cleanupKeys: string[],
): string {
  storeSession(stored, authority, session);
  if (persistSessions(storage, stored)) {
    for (const key of cleanupKeys) {
      try {
        storage.removeItem(key);
      } catch {
        // The V3 copy is already safe to use if legacy cleanup is blocked.
      }
    }
  }
  return session.token;
}

export function getSessionAuthority(socketUrl?: string): string | null {
  const configured = normalizeAuthority(socketUrl);
  if (configured) return configured;
  return typeof window === 'undefined' ? null : normalizeAuthority(window.location.origin);
}

export function readPlayerSession(
  authority: string | null = getSessionAuthority(),
  storage: SessionStorage | undefined = browserStorage(),
): string | null {
  const normalizedAuthority = normalizeAuthority(authority);
  if (!storage || !normalizedAuthority) return null;

  const stored = readStoredSessions(storage);
  const storedSession = stored.sessions[normalizedAuthority];
  if (storedSession) return storedSession.token;

  const legacyV2 = readLegacyV2Sessions(storage);
  for (const [legacyAuthority, session] of Object.entries(legacyV2)) {
    if (!stored.sessions[legacyAuthority]) stored.sessions[legacyAuthority] = session;
  }
  const legacyV2Session = legacyV2[normalizedAuthority];
  if (legacyV2Session) {
    return migrateSession(storage, stored, normalizedAuthority, legacyV2Session, [
      LEGACY_PLAYER_SESSION_STORAGE_V2_KEY,
    ]);
  }

  const legacyToken = readLegacyToken(storage);
  if (!legacyToken) return null;
  return migrateSession(storage, stored, normalizedAuthority, { token: legacyToken, roomCode: null }, [
    LEGACY_PLAYER_SESSION_STORAGE_KEY,
  ]);
}

export function readPlayerSessionForRoom(
  authority: string | null,
  roomCode: string,
  storage: SessionStorage | undefined = browserStorage(),
): string | null {
  const normalizedAuthority = normalizeAuthority(authority);
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!storage || !normalizedAuthority || !normalizedRoomCode) return null;
  const session = readStoredSessions(storage).sessions[normalizedAuthority];
  return session?.roomCode === normalizedRoomCode ? session.token : null;
}

function writeStoredPlayerSession(
  token: string,
  authority: string | null,
  roomCode: string | null,
  storage: SessionStorage | undefined,
): boolean {
  const parsedToken = reconnectTokenSchema.safeParse(token);
  const normalizedAuthority = normalizeAuthority(authority);
  if (!storage || !normalizedAuthority || !parsedToken.success) return false;

  const stored = readStoredSessions(storage);
  storeSession(stored, normalizedAuthority, { token: parsedToken.data, roomCode });
  return persistSessions(storage, stored);
}

export function writePlayerSession(
  token: string,
  authority: string | null = getSessionAuthority(),
  storage: SessionStorage | undefined = browserStorage(),
): boolean {
  return writeStoredPlayerSession(token, authority, null, storage);
}

export function writePlayerSessionForRoom(
  token: string,
  authority: string | null,
  roomCode: string,
  storage: SessionStorage | undefined = browserStorage(),
): boolean {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!normalizedRoomCode) return false;
  return writeStoredPlayerSession(token, authority, normalizedRoomCode, storage);
}

export function clearPlayerSession(
  authority: string | null = getSessionAuthority(),
  storage: SessionStorage | undefined = browserStorage(),
): void {
  const normalizedAuthority = normalizeAuthority(authority);
  if (!storage || !normalizedAuthority) return;
  const stored = readStoredSessions(storage);
  delete stored.sessions[normalizedAuthority];
  if (Object.keys(stored.sessions).length === 0) {
    try {
      storage.removeItem(PLAYER_SESSION_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in hardened browser contexts.
    }
  } else {
    persistSessions(storage, stored);
  }

  const legacyV2 = readLegacyV2Sessions(storage);
  if (legacyV2[normalizedAuthority]) {
    delete legacyV2[normalizedAuthority];
    try {
      if (Object.keys(legacyV2).length === 0) storage.removeItem(LEGACY_PLAYER_SESSION_STORAGE_V2_KEY);
      else storage.setItem(LEGACY_PLAYER_SESSION_STORAGE_V2_KEY, serializeLegacyV2Sessions(legacyV2));
    } catch {
      // Clearing the V3 record remains non-fatal if legacy cleanup is blocked.
    }
  }
  try {
    storage.removeItem(LEGACY_PLAYER_SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

export { PLAYER_SESSION_STORAGE_VERSION };
