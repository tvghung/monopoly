import { reconnectTokenSchema } from '@monopoly/shared';

const LEGACY_PLAYER_SESSION_STORAGE_KEY = 'monopoly.player-session.v1';
const PLAYER_SESSION_STORAGE_VERSION = 2 as const;
const PLAYER_SESSION_MAX_AUTHORITIES = 8;

export const PLAYER_SESSION_STORAGE_KEY = 'monopoly.player-session.v2';

interface StoredPlayerSessions {
  version: typeof PLAYER_SESSION_STORAGE_VERSION;
  sessions: Record<string, string>;
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): SessionStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
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

export function getSessionAuthority(socketUrl?: string): string | null {
  const configured = normalizeAuthority(socketUrl);
  if (configured) return configured;
  return typeof window === 'undefined' ? null : normalizeAuthority(window.location.origin);
}

function readStoredSessions(storage: SessionStorage): StoredPlayerSessions {
  try {
    const raw = storage.getItem(PLAYER_SESSION_STORAGE_KEY);
    if (!raw) return { version: PLAYER_SESSION_STORAGE_VERSION, sessions: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid session record');
    const candidate = parsed as Partial<StoredPlayerSessions>;
    if (candidate.version !== PLAYER_SESSION_STORAGE_VERSION
      || !candidate.sessions
      || typeof candidate.sessions !== 'object'
      || Array.isArray(candidate.sessions)) {
      throw new Error('invalid session record');
    }
    const sessions: Record<string, string> = {};
    for (const [authority, token] of Object.entries(candidate.sessions)) {
      if (normalizeAuthority(authority) !== authority) continue;
      if (reconnectTokenSchema.safeParse(token).success) sessions[authority] = token;
    }
    return { version: PLAYER_SESSION_STORAGE_VERSION, sessions };
  } catch {
    return { version: PLAYER_SESSION_STORAGE_VERSION, sessions: {} };
  }
}

function readLegacyToken(storage: SessionStorage): string | null {
  if (typeof window !== 'undefined' && window.location.protocol === 'app:') return null;
  try {
    const raw = storage.getItem(LEGACY_PLAYER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
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

export function readPlayerSession(
  authority: string | null = getSessionAuthority(),
  storage: SessionStorage | undefined = browserStorage(),
): string | null {
  const normalizedAuthority = normalizeAuthority(authority);
  if (!storage || !normalizedAuthority) return null;

  const stored = readStoredSessions(storage);
  const storedToken = stored.sessions[normalizedAuthority];
  if (storedToken) return storedToken;

  const legacyToken = readLegacyToken(storage);
  if (!legacyToken) return null;
  stored.sessions[normalizedAuthority] = legacyToken;
  if (persistSessions(storage, stored)) {
    try {
      storage.removeItem(LEGACY_PLAYER_SESSION_STORAGE_KEY);
    } catch {
      // A v2 copy is already safe to use even if legacy cleanup is blocked.
    }
  }
  return legacyToken;
}

export function writePlayerSession(
  token: string,
  authority: string | null = getSessionAuthority(),
  storage: SessionStorage | undefined = browserStorage(),
): boolean {
  const parsedToken = reconnectTokenSchema.safeParse(token);
  const normalizedAuthority = normalizeAuthority(authority);
  if (!storage || !normalizedAuthority || !parsedToken.success) return false;

  const stored = readStoredSessions(storage);
  stored.sessions[normalizedAuthority] = parsedToken.data;
  const authorities = Object.keys(stored.sessions);
  for (const oldAuthority of authorities.slice(
    0,
    Math.max(0, authorities.length - PLAYER_SESSION_MAX_AUTHORITIES),
  )) {
    delete stored.sessions[oldAuthority];
  }
  return persistSessions(storage, stored);
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
    return;
  }
  persistSessions(storage, stored);
}

export { PLAYER_SESSION_STORAGE_VERSION };
