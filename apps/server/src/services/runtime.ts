import { randomUUID } from 'node:crypto';
import type { PersistenceTimingConfig } from '../config';
import type { PersistenceStore } from '../persistence';
import type { RoomSnapshot } from '../rooms';
import { BotRequestLedger } from './botRequestLedger';
import { RoomCommandExecutor } from './roomCommandExecutor';
import { ConnectionRegistry } from './connectionRegistry';
import { PlayerSessionService } from './playerSessionService';

export interface RuntimeFlags {
  shuttingDown: boolean;
}

export interface AppRuntime {
  persistence: PersistenceStore<RoomSnapshot>;
  commands: RoomCommandExecutor<RoomSnapshot>;
  connections: ConnectionRegistry;
  sessions: PlayerSessionService;
  /** `add bot` request ids already applied per room (idempotent retries). */
  botRequests: BotRequestLedger;
  timing: PersistenceTimingConfig;
  flags: RuntimeFlags;
  /** A random id of this server process: shown by `/_otb/room` and in the resume ACK, never a credential. */
  instanceId: string;
  /** Told about every room change so bot seats can answer what the room waits for (set once the bot driver exists). */
  bots?: { notify(roomId: string): void };
}

/** The deadline lengths every payment-queue mutation needs (liquidation, and the 2v2 rescue decision), from one place. */
export function paymentTimingOptions(runtime: AppRuntime): {
  paymentShortfallActionTimeoutMs: number;
  emergencyRescueTimeoutMs: number;
} {
  return {
    paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
    emergencyRescueTimeoutMs: runtime.timing.emergencyRescueTimeoutMs,
  };
}

export function createAppRuntime(
  persistence: PersistenceStore<RoomSnapshot>,
  timing: PersistenceTimingConfig,
): AppRuntime {
  return {
    persistence,
    commands: new RoomCommandExecutor(persistence),
    connections: new ConnectionRegistry(),
    sessions: new PlayerSessionService(persistence, timing),
    botRequests: new BotRequestLedger(),
    instanceId: randomUUID(),
    timing,
    flags: { shuttingDown: false },
  };
}
