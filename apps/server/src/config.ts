export interface DatabaseConfig {
  connectionString: string;
  ssl: boolean;
  rejectUnauthorized: boolean;
  maxConnections: number;
}

export type ServerRuntimeProfile = 'development' | 'cloud' | 'desktop';

export interface PersistenceTimingConfig {
  reconnectGraceMs: number;
  paymentShortfallActionTimeoutMs: number;
  cardAwaitingDrawTimeoutMs: number;
  cardRevealedTimeoutMs: number;
  pendingSessionTtlMs: number;
  terminalSessionRetentionMs: number;
  lobbyRetentionMs: number;
  inProgressRetentionMs: number;
  finishedRetentionMs: number;
}

export interface ServerConfig {
  nodeEnv: string;
  runtimeProfile: ServerRuntimeProfile;
  listenHost: string;
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

function readPort(
  environment: NodeJS.ProcessEnv,
  runtimeProfile: ServerRuntimeProfile,
): number {
  const rawValue = environment.PORT;
  if (rawValue === undefined || rawValue === '') return 8080;
  const value = Number(rawValue);
  const minimum = runtimeProfile === 'desktop' ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum || value > 65_535) {
    throw new Error(
      runtimeProfile === 'desktop'
        ? 'PORT must be an integer between 0 and 65535'
        : 'PORT must be an integer between 1 and 65535',
    );
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

export function resolveRuntimeProfile(
  environment: NodeJS.ProcessEnv,
): ServerRuntimeProfile {
  const configured = environment.SERVER_RUNTIME_PROFILE?.trim();
  if (configured === undefined || configured === '') {
    return environment.NODE_ENV === 'production' ? 'cloud' : 'development';
  }
  if (
    configured !== 'development'
    && configured !== 'cloud'
    && configured !== 'desktop'
  ) {
    throw new Error(
      'SERVER_RUNTIME_PROFILE must be development, cloud, or desktop',
    );
  }
  return configured;
}

function readListenHost(
  environment: NodeJS.ProcessEnv,
  runtimeProfile: ServerRuntimeProfile,
): string {
  const configured = environment.SERVER_HOST?.trim();
  if (configured === '') throw new Error('SERVER_HOST must not be empty');
  return configured
    || (runtimeProfile === 'cloud' ? '0.0.0.0' : '127.0.0.1');
}

export function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
  options: LoadServerConfigOptions = {},
): ServerConfig {
  const nodeEnv = environment.NODE_ENV ?? 'development';
  const runtimeProfile = resolveRuntimeProfile(environment);
  const databaseUrl = environment.DATABASE_URL?.trim();
  const requireDatabase = options.requireDatabase ?? nodeEnv === 'production';

  if (requireDatabase && !databaseUrl) {
    throw new Error('DATABASE_URL is required for durable server operation');
  }

  return {
    nodeEnv,
    runtimeProfile,
    listenHost: readListenHost(environment, runtimeProfile),
    port: readPort(environment, runtimeProfile),
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
      paymentShortfallActionTimeoutMs: readPositiveInteger(
        environment,
        'PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS',
        120_000,
      ),
      cardAwaitingDrawTimeoutMs: readPositiveInteger(
        environment,
        'CARD_AWAITING_DRAW_TIMEOUT_MS',
        20_000,
      ),
      cardRevealedTimeoutMs: readPositiveInteger(
        environment,
        'CARD_REVEALED_TIMEOUT_MS',
        30_000,
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
