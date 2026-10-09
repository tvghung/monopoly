const MAX_REQUESTS_PER_ROOM = 128;
const MAX_ROOMS = 1024;
const REQUEST_TTL_MS = 10 * 60_000;

interface LedgerEntry<TOutcome> {
  outcome: TOutcome;
  at: number;
}

/**
 * Remembers the outcome of money-moving requests that carry a client `requestId` (`sell house`, `make offer`), so a retransmitted
 * emit (Socket.IO replays a buffered packet after a reconnect, a double click sends twice) answers with the first outcome
 * instead of selling a second house or creating a second offer. The key is the actor, the event and the id, so one id never
 * answers for another player or another command. Only committed requests are recorded: a refused one may legitimately succeed on
 * a later attempt with a fresh id. A new request, even for the same tile or the same terms, carries a new id and is a new action.
 *
 * Runtime memory only and bounded like `BotRequestLedger`: at most 128 ids per room for 10 minutes and 1024 rooms, oldest first.
 */
export class CommandRequestLedger<TOutcome> {
  private readonly rooms = new Map<string, Map<string, LedgerEntry<TOutcome>>>();

  constructor(private readonly clock: () => number = Date.now) {}

  private static key(playerId: string, event: string, requestId: string): string {
    return `${playerId}\u0000${event}\u0000${requestId}`;
  }

  find(roomId: string, playerId: string, event: string, requestId: string): TOutcome | undefined {
    const key = CommandRequestLedger.key(playerId, event, requestId);
    const entry = this.rooms.get(roomId)?.get(key);
    if (!entry) return undefined;
    if (this.clock() - entry.at > REQUEST_TTL_MS) {
      this.rooms.get(roomId)?.delete(key);
      return undefined;
    }
    return entry.outcome;
  }

  record(roomId: string, playerId: string, event: string, requestId: string, outcome: TOutcome): void {
    let entries = this.rooms.get(roomId);
    if (!entries) {
      if (this.rooms.size >= MAX_ROOMS) {
        const oldest = this.rooms.keys().next().value;
        if (oldest !== undefined) this.rooms.delete(oldest);
      }
      entries = new Map();
      this.rooms.set(roomId, entries);
    }
    const key = CommandRequestLedger.key(playerId, event, requestId);
    entries.delete(key);
    entries.set(key, { outcome, at: this.clock() });
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
