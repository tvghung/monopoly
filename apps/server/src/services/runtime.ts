import type { PersistenceTimingConfig } from '../config';
import type { PersistenceStore } from '../persistence';
import type { RoomSnapshot } from '../rooms';
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
  timing: PersistenceTimingConfig;
  flags: RuntimeFlags;
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
    timing,
    flags: { shuttingDown: false },
  };
}
