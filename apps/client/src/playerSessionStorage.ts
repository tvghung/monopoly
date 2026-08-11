import { reconnectTokenSchema } from '@monopoly/shared';

const PLAYER_SESSION_STORAGE_KEY = 'monopoly.player-session.v1';
const PLAYER_SESSION_STORAGE_VERSION = 1;

interface StoredPlayerSession {
  version: typeof PLAYER_SESSION_STORAGE_VERSION;
  token: string;
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): SessionStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

export function readPlayerSession(
  storage: SessionStorage | undefined = browserStorage(),
): string | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(PLAYER_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const candidate = parsed as Partial<StoredPlayerSession>;
    if (candidate.version !== PLAYER_SESSION_STORAGE_VERSION) {
      return null;
    }
    const parsedToken = reconnectTokenSchema.safeParse(candidate.token);
    return parsedToken.success ? parsedToken.data : null;
  } catch {
    return null;
  }
}

export function writePlayerSession(
  token: string,
  storage: SessionStorage | undefined = browserStorage(),
): boolean {
  const parsedToken = reconnectTokenSchema.safeParse(token);
  if (!storage || !parsedToken.success) return false;

  const session: StoredPlayerSession = {
    version: PLAYER_SESSION_STORAGE_VERSION,
    token: parsedToken.data,
  };

  try {
    storage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearPlayerSession(
  storage: SessionStorage | undefined = browserStorage(),
): void {
  try {
    storage?.removeItem(PLAYER_SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened browser contexts. The in-memory
    // session is still cleared by the caller.
  }
}

export { PLAYER_SESSION_STORAGE_KEY };
