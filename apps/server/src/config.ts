export type ServerRuntimeProfile = 'development' | 'desktop';

export interface PersistenceTimingConfig {
  reconnectGraceMs: number;
  paymentShortfallActionTimeoutMs: number;
  cardAwaitingDrawTimeoutMs: number;
  cardRevealedTimeoutMs: number;
  emergencyRescueTimeoutMs: number;
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
  persistenceTiming: PersistenceTimingConfig;
  /** Multiplies the bots' presentation delays (`BOT_ACTION_DELAY_SCALE`, 0-3, default 1). */
  botActionDelayScale: number;
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

function readDelayScale(environment: NodeJS.ProcessEnv): number {
  const rawValue = environment.BOT_ACTION_DELAY_SCALE;
  if (rawValue === undefined || rawValue === '') return 1;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > 3) {
    throw new Error('BOT_ACTION_DELAY_SCALE must be a number between 0 and 3');
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

export function resolveRuntimeProfile(
  environment: NodeJS.ProcessEnv,
): ServerRuntimeProfile {
  const configured = environment.SERVER_RUNTIME_PROFILE?.trim();
  if (configured === undefined || configured === '') {
    return 'development';
  }
  if (
    configured !== 'development'
    && configured !== 'desktop'
  ) {
    throw new Error(
      'SERVER_RUNTIME_PROFILE must be development or desktop',
    );
  }
  return configured;
}

function readListenHost(
  environment: NodeJS.ProcessEnv,
): string {
  const configured = environment.SERVER_HOST?.trim();
  if (configured === '') throw new Error('SERVER_HOST must not be empty');
  return configured
    || '127.0.0.1';
}

export function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const nodeEnv = environment.NODE_ENV ?? 'development';
  const runtimeProfile = resolveRuntimeProfile(environment);

  return {
    nodeEnv,
    runtimeProfile,
    listenHost: readListenHost(environment),
    port: readPort(environment, runtimeProfile),
    botActionDelayScale: readDelayScale(environment),
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
      emergencyRescueTimeoutMs: readPositiveInteger(
        environment,
        'EMERGENCY_RESCUE_TIMEOUT_MS',
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
