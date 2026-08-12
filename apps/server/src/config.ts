export interface DatabaseConfig {
  connectionString: string;
  ssl: boolean;
  rejectUnauthorized: boolean;
  maxConnections: number;
}

export interface PersistenceTimingConfig {
  reconnectGraceMs: number;
  debtActionTimeoutMs: number;
  buildingContentionMs: number;
  pendingSessionTtlMs: number;
  terminalSessionRetentionMs: number;
  lobbyRetentionMs: number;
  inProgressRetentionMs: number;
  finishedRetentionMs: number;
}

export interface ServerConfig {
  nodeEnv: string;
  port: number;
  database: DatabaseConfig | null;
  persistenceTiming: PersistenceTimingConfig;
}

export interface LoadServerConfigOptions {
  /** Tests may opt out; production always requires a durable database. */
  requireDatabase?: boolean;
}

function readPositiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
): number {
  const rawValue = environment[name];
  if (rawValue === undefined || rawValue === '') return defaultValue;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readBoolean(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: boolean,
): boolean {
  const rawValue = environment[name];
  if (rawValue === undefined || rawValue === '') return defaultValue;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be either true or false`);
}

export function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
  options: LoadServerConfigOptions = {},
): ServerConfig {
  const nodeEnv = environment.NODE_ENV ?? 'development';
  const databaseUrl = environment.DATABASE_URL?.trim();
  const requireDatabase = options.requireDatabase ?? nodeEnv === 'production';

  if (requireDatabase && !databaseUrl) {
    throw new Error('DATABASE_URL is required for durable server operation');
  }

  return {
    nodeEnv,
    port: readPositiveInteger(environment, 'PORT', 8080),
    database: databaseUrl
      ? {
          connectionString: databaseUrl,
          ssl: readBoolean(environment, 'DATABASE_SSL', false),
          rejectUnauthorized: readBoolean(
            environment,
            'DATABASE_SSL_REJECT_UNAUTHORIZED',
            true,
          ),
          maxConnections: readPositiveInteger(
            environment,
            'DATABASE_MAX_CONNECTIONS',
            10,
          ),
        }
      : null,
    persistenceTiming: {
      reconnectGraceMs: readPositiveInteger(
        environment,
        'RECONNECT_GRACE_MS',
        60_000,
      ),
      debtActionTimeoutMs: readPositiveInteger(
        environment,
        'DEBT_ACTION_TIMEOUT_MS',
        120_000,
      ),
      buildingContentionMs: readPositiveInteger(
        environment,
        'BUILDING_CONTENTION_MS',
        10_000,
      ),
      pendingSessionTtlMs: readPositiveInteger(
        environment,
        'PENDING_SESSION_TTL_MS',
        5 * 60_000,
      ),
      terminalSessionRetentionMs: readPositiveInteger(
        environment,
        'TERMINAL_SESSION_RETENTION_MS',
        7 * 24 * 60 * 60_000,
      ),
      lobbyRetentionMs: readPositiveInteger(
        environment,
        'LOBBY_RETENTION_MS',
        24 * 60 * 60_000,
      ),
      inProgressRetentionMs: readPositiveInteger(
        environment,
        'IN_PROGRESS_RETENTION_MS',
        30 * 24 * 60 * 60_000,
      ),
      finishedRetentionMs: readPositiveInteger(
        environment,
        'FINISHED_RETENTION_MS',
        7 * 24 * 60 * 60_000,
      ),
    },
  };
}
