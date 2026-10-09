import type { PlayerId } from '@monopoly/shared';

const MAX_REQUESTS_PER_ROOM = 64;
const MAX_ROOMS = 1024;
const REQUEST_TTL_MS = 10 * 60_000;

interface LedgerEntry {
  playerId: PlayerId;
  at: number;
}

/**
 * Remembers which `add bot` request ids a room already applied, so a retried click (Socket.IO replays a buffered emit after a
 * reconnect) answers with the bot it created instead of adding another. Runtime memory only and bounded: at most 64 ids per
 * room for 10 minutes and 1024 rooms; the oldest entries are forgotten first.
 */
export class BotRequestLedger {
  private readonly rooms = new Map<string, Map<string, LedgerEntry>>();

  constructor(private readonly clock: () => number = Date.now) {}

  find(roomId: string, requestId: string): PlayerId | undefined {
    const entry = this.rooms.get(roomId)?.get(requestId);
    if (!entry) return undefined;
    if (this.clock() - entry.at > REQUEST_TTL_MS) {
      this.rooms.get(roomId)?.delete(requestId);
      return undefined;
    }
    return entry.playerId;
  }

  record(roomId: string, requestId: string, playerId: PlayerId): void {
    let entries = this.rooms.get(roomId);
    if (!entries) {
      if (this.rooms.size >= MAX_ROOMS) {
        const oldest = this.rooms.keys().next().value;
        if (oldest !== undefined) this.rooms.delete(oldest);
      }
      entries = new Map();
      this.rooms.set(roomId, entries);
    }
    entries.delete(requestId);
    entries.set(requestId, { playerId, at: this.clock() });
    while (entries.size > MAX_REQUESTS_PER_ROOM) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  forgetRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }
}
