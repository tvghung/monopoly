import type { PlayerId } from '@monopoly/shared';
import {
  acceptForcedSaleCommand,
  acceptOfferCommand,
  acceptRescueCommand,
  declineOfferCommand,
  declineRescueCommand,
  dismissCardCommand,
  drawCardCommand,
  payBailCommand,
  rejectForcedSaleCommand,
  resolveDevelopmentCommand,
  resolvePurchaseCommand,
  reviveTeammateCommand,
  rollDiceCommand,
  runGameCommand,
  sellPropertyToBankCommand,
  useJailCardCommand,
  waitInJailCommand,
  type GameCommand,
} from '../commands/gameplay';
import type { RoomRecord } from '../persistence/types';
import { RuntimeUnavailableError } from '../persistence/types';
import type { RoomSnapshot } from '../rooms';
import { recoverRoomIfDue } from '../services/deadlineScheduler';
import { hasConnectedHuman } from '../services/presence';
import type { AppRuntime } from '../services/runtime';
import { broadcastRoom } from '../socket/broadcast';
import { CommandError } from '../socket/errors';
import { commitRoomCommand } from '../socket/roomCommands';
import type { DomainCommandContext } from '../socket/roomCommands';
import type { AppServer } from '../socket/types';
import {
  botActionDelayMs,
  decideBotAction,
  findBotTask,
  type BotAction,
  type BotDecision,
  type BotTask,
} from './policy';
import { buildBotViews, roomHasBots, type BotView } from './view';

export interface BotDriverOptions {
  /** Multiplies every presentation delay; 0 acts on the next tick (tests). */
  delayScale?: number;
  /** How often rooms with bots are re-checked when no commit announced a change. */
  sweepIntervalMs?: number;
  /** Writes one line per decision (and refusals) when set. */
  log?: (line: string) => void;
  /** Waits before each fresh re-decision after the fallback was refused too (bounded; then authoritative recovery). */
  recoveryDelaysMs?: readonly number[];
}

/** The task an armed timer was set for no longer matches the room: somebody else's commit got there first. */
class StaleBotTaskError extends Error {}

const JOURNAL_LIMIT = 50;
const DEAD_KEY_LIMIT = 512;
const RETRY_DELAY_MS = 300;
/** After the first choice and the fallback were refused: two more fresh decisions, further apart, then recovery. */
const RECOVERY_DELAYS_MS: readonly number[] = [2_000, 8_000];
/**
 * Tasks the server already resolves on its own absolute deadline (payment, rescue, forced sale, offer, legacy card draw): a
 * bot that cannot answer one leaves it to that deadline, exactly like an absent human.
 */
const DEADLINE_BACKED: ReadonlySet<BotTask['kind']> = new Set(['DEBT', 'RESCUE', 'FORCED_SALE', 'OFFER', 'DRAW_CARD']);

interface Invocation {
  command: GameCommand<never, unknown>;
  payload: unknown;
}

/** The shared command (the very one a socket handler runs) behind a bot action name. */
function invocationOf(action: BotAction): Invocation {
  const payload = action.payload;
  switch (action.command) {
    case 'roll dice': return { command: rollDiceCommand, payload: undefined };
    case 'buy property': return { command: resolvePurchaseCommand, payload: { ...(payload as object), buy: true } };
    case 'do not buy': return { command: resolvePurchaseCommand, payload: { ...(payload as object), buy: false } };
    case 'resolve development': return { command: resolveDevelopmentCommand, payload };
    case 'draw card': return { command: drawCardCommand, payload };
    case 'dismiss card': return { command: dismissCardCommand, payload };
    case 'pay bail': return { command: payBailCommand, payload: undefined };
    case 'use jail card': return { command: useJailCardCommand, payload: undefined };
    case 'wait in jail': return { command: waitInJailCommand, payload: undefined };
    case 'sell property to bank': return { command: sellPropertyToBankCommand, payload };
    case 'accept forced sale': return { command: acceptForcedSaleCommand, payload };
    case 'reject forced sale': return { command: rejectForcedSaleCommand, payload };
    case 'accept rescue': return { command: acceptRescueCommand, payload };
    case 'decline rescue': return { command: declineRescueCommand, payload };
    case 'accept offer': return { command: acceptOfferCommand, payload };
    case 'decline offer': return { command: declineOfferCommand, payload };
    case 'revive teammate': return { command: reviveTeammateCommand, payload: undefined };
  }
}

/**
 * Plays every bot seat of the process. It keeps no durable state: each check derives the one open bot task from the room as
 * it is, arms at most one timer per room, and acts through `runGameCommand` with a guard that re-derives the task inside the
 * room queue, so a stale timer, a duplicate fire, a restore or a rematch can never apply a second effect.
 *
 * Recovery is bounded: a refused first choice is retried once with an always-legal fallback, then decided afresh at most
 * `recoveryDelaysMs.length` more times, further apart. A task still stuck after that is resolved by the server's own turn
 * recovery (the very path an absent human's turn takes: decline the purchase, skip the development, apply the revealed card
 * or pass the turn), or, when the server already owns a deadline for it, left to that deadline. Either way the task is then
 * parked with one meaningful journal line, so nothing retries forever or floods timers or logs.
 */
export class BotDriver {
  private readonly timers = new Map<string, { key: string; timer: ReturnType<typeof setTimeout> }>();

  private readonly rooms = new Set<string>();

  private readonly running = new Map<string, Promise<void>>();

  private readonly rerun = new Set<string>();

  private readonly failures = new Map<string, number>();

  private readonly dead = new Set<string>();

  private readonly recoveryDelays: readonly number[];

  private readonly journals = new Map<string, string[]>();

  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  private active = false;

  constructor(
    private readonly io: AppServer,
    private readonly runtime: AppRuntime,
    private readonly options: BotDriverOptions = {},
  ) {
    this.recoveryDelays = options.recoveryDelaysMs ?? RECOVERY_DELAYS_MS;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.sweepTimer = setInterval(() => {
      for (const roomId of this.rooms) this.notify(roomId);
    }, this.options.sweepIntervalMs ?? 1_000);
    this.sweepTimer.unref?.();
  }

  stop(): void {
    this.active = false;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
    for (const { timer } of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.rooms.clear();
  }

  /** A room changed (or may have): re-derive its bot task. Cheap and idempotent; called after every broadcast. */
  notify(roomId: string): void {
    if (!this.active || this.runtime.flags.shuttingDown) return;
    if (this.running.has(roomId)) {
      this.rerun.add(roomId);
      return;
    }
    const run = this.evaluate(roomId)
      .catch((error: unknown) => this.report(roomId, 'evaluation failed', error))
      .finally(() => {
        this.running.delete(roomId);
        if (this.rerun.delete(roomId)) this.notify(roomId);
      });
    this.running.set(roomId, run);
  }

  /** Resolves once no evaluation is in flight (tests). */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running.values()]);
  }

  /** The decisions made for a room, newest last (bounded). Ids, kinds and choices only; never tokens or hidden cards. */
  journal(roomId: string): readonly string[] {
    return this.journals.get(roomId) ?? [];
  }

  /** The key of the task a room's timer is armed for, if any (tests). */
  armedKey(roomId: string): string | undefined {
    return this.timers.get(roomId)?.key;
  }

  private cancel(roomId: string): void {
    const armed = this.timers.get(roomId);
    if (armed) clearTimeout(armed.timer);
    this.timers.delete(roomId);
  }

  private async loadViews(room: RoomRecord<RoomSnapshot>): Promise<BotView[]> {
    const offers = await this.runtime.persistence.tradeOffers.listPendingForRoom(room.id);
    return buildBotViews(room, this.runtime.connections, offers, new Date());
  }

  private async evaluate(roomId: string): Promise<void> {
    const room = await this.runtime.persistence.rooms.findById(roomId);
    if (!room || !roomHasBots(room)) {
      this.cancel(roomId);
      this.rooms.delete(roomId);
      this.journals.delete(roomId);
      return;
    }
    this.rooms.add(roomId);
    // Bots only play while a human is there to see it; a room where every human dropped waits for them.
    if (room.status !== 'IN_PROGRESS' || !hasConnectedHuman(this.runtime.connections, room.gameSnapshot)) {
      this.cancel(roomId);
      return;
    }
    const views = await this.loadViews(room);
    const task = findBotTask(views);
    if (!task || this.dead.has(task.key)) {
      this.cancel(roomId);
      return;
    }
    if (this.timers.get(roomId)?.key === task.key) return;
    this.cancel(roomId);
    const view = views.find(candidate => candidate.botId === task.botId);
    if (!view) return;
    const failed = this.failures.get(task.key) ?? 0;
    const delay = failed === 0
      ? botActionDelayMs(view, task) * (this.options.delayScale ?? 1)
      : failed === 1 ? RETRY_DELAY_MS : this.recoveryDelays[failed - 2] ?? 0;
    const timer = setTimeout(() => {
      if (this.timers.get(roomId)?.key === task.key) this.timers.delete(roomId);
      void this.fire(roomId, task).catch((error: unknown) => this.report(roomId, 'action failed', error));
    }, Math.max(0, delay));
    timer.unref?.();
    this.timers.set(roomId, { key: task.key, timer });
  }

  private async fire(roomId: string, task: BotTask): Promise<void> {
    if (!this.active || this.runtime.flags.shuttingDown) return;
    const room = await this.runtime.persistence.rooms.findById(roomId);
    if (!room) return;
    const views = await this.loadViews(room);
    const current = findBotTask(views);
    const view = views.find(candidate => candidate.botId === task.botId);
    if (!current || current.key !== task.key || !view) {
      this.notify(roomId);
      return;
    }
    const attempts = this.failures.get(task.key) ?? 0;
    if (attempts >= 2 + this.recoveryDelays.length) {
      await this.recover(roomId, task, view, `${String(attempts)} refused attempts`);
      return;
    }
    const decision = decideBotAction(view, task);
    if (!decision) {
      await this.recover(roomId, task, view, 'no decision');
      return;
    }
    const chosen = attempts > 0 ? decision.fallback : decision.action;
    try {
      await this.perform(roomId, task.botId, task, chosen);
      this.failures.delete(task.key);
      this.record(roomId, view, decision, chosen);
    } catch (error) {
      if (error instanceof StaleBotTaskError) {
        this.notify(roomId);
        return;
      }
      if (error instanceof RuntimeUnavailableError || !this.active) return;
      const failed = attempts + 1;
      this.setFailures(task.key, failed);
      this.report(roomId, `${chosen.command} refused (${String(failed)})`, error);
      // The next evaluation waits longer (see `evaluate`) and, once the bounded attempts are spent, recovers.
      this.notify(roomId);
    }
  }

  private async perform(roomId: string, botId: PlayerId, task: BotTask, chosen: BotAction): Promise<void> {
    const { command, payload } = invocationOf(chosen);
    await runGameCommand(this.io, this.runtime, command, roomId, botId, payload as never, {
      guard: async (context: DomainCommandContext) => {
        // Inside the room queue: the room must still be waiting on exactly this bot task.
        const snapshotRoom: RoomRecord<RoomSnapshot> = {
          ...context.original,
          status: context.room.status,
          hostPlayerId: context.room.hostPlayerId,
          gameSnapshot: context.room.gameSnapshot,
        };
        const offers = await context.transaction.tradeOffers.listPendingForRoom(roomId);
        const latest = findBotTask(buildBotViews(snapshotRoom, this.runtime.connections, offers, context.now));
        if (!latest || latest.key !== task.key || latest.botId !== task.botId) throw new StaleBotTaskError();
      },
    });
  }

  private setFailures(key: string, count: number): void {
    this.failures.delete(key);
    this.failures.set(key, count);
    if (this.failures.size > DEAD_KEY_LIMIT) {
      const oldest = this.failures.keys().next().value;
      if (oldest !== undefined) this.failures.delete(oldest);
    }
  }

  /**
   * The bounded attempts are spent: let the server resolve the task. A turn-bound task (roll, purchase, development, revealed
   * card) is handed to turn recovery with an immediate deadline, inside the room queue and only while the room still waits on
   * exactly this task; any other task already has a server deadline. The task is parked either way, with one clear line.
   */
  private async recover(roomId: string, task: BotTask, view: BotView, why: string): Promise<void> {
    const name = view.room.gameState.players[task.botId]?.name ?? task.botId;
    this.park(roomId, task, why);
    this.failures.delete(task.key);
    if (DEADLINE_BACKED.has(task.kind)) {
      this.writeJournal(roomId, `[bot] ${name} cannot answer ${task.kind}; the server resolves it at its deadline`);
      return;
    }
    const now = new Date();
    try {
      const armed = await commitRoomCommand(this.runtime, roomId, async (context) => {
        const snapshotRoom: RoomRecord<RoomSnapshot> = {
          ...context.original,
          status: context.room.status,
          hostPlayerId: context.room.hostPlayerId,
          gameSnapshot: context.room.gameSnapshot,
        };
        const offers = await context.transaction.tradeOffers.listPendingForRoom(roomId);
        const latest = findBotTask(buildBotViews(snapshotRoom, this.runtime.connections, offers, context.now));
        const { state } = context;
        if (
          !latest || latest.key !== task.key || latest.botId !== task.botId
          || context.room.status !== 'IN_PROGRESS'
          || state.boardState.currentPlayer.id !== task.botId
          || state.boardState.paymentQueue
          || state.boardState.turnRecovery
          || state.boardState.winner
        ) throw new StaleBotTaskError();
        state.boardState.turnRecovery = {
          playerId: task.botId,
          turnNumber: state.boardState.turnNumber,
          deadlineAt: now.toISOString(),
          pendingOperationId: state.turnInfo.pendingPropertyDecision?.operationId
            ?? state.turnInfo.pendingDevelopmentDecision?.operationId
            ?? state.turnInfo.pendingCardInteraction?.operationId
            ?? null,
        };
      }, now);
      if (armed.room) broadcastRoom(this.io, this.runtime, armed.room);
      await recoverRoomIfDue(this.io, this.runtime, roomId, now);
      this.writeJournal(roomId, `[bot] ${name} could not resolve ${task.kind}; the server's turn recovery resolved it`);
    } catch (error) {
      if (error instanceof StaleBotTaskError) {
        this.notify(roomId);
        return;
      }
      if (error instanceof RuntimeUnavailableError) return;
      this.report(roomId, `${name} could not resolve ${task.kind} and recovery failed; waiting for the room to change`, error);
    }
  }

  private park(roomId: string, task: BotTask, why: string): void {
    this.dead.add(task.key);
    if (this.dead.size > DEAD_KEY_LIMIT) {
      const oldest = this.dead.values().next().value;
      if (oldest !== undefined) this.dead.delete(oldest);
    }
    this.cancel(roomId);
    this.writeJournal(roomId, `[bot] parked ${task.kind} (${why})`);
  }

  private record(roomId: string, view: BotView, decision: BotDecision, chosen: BotAction): void {
    const name = view.room.gameState.players[view.botId]?.name ?? view.botId;
    const fallback = chosen === decision.action ? '' : ' [fallback]';
    this.writeJournal(roomId, `[bot] ${name} ${decision.task.kind} -> ${chosen.command}${fallback} (${decision.reason})`);
  }

  private writeJournal(roomId: string, line: string): void {
    const lines = this.journals.get(roomId) ?? [];
    lines.push(line);
    if (lines.length > JOURNAL_LIMIT) lines.splice(0, lines.length - JOURNAL_LIMIT);
    this.journals.set(roomId, lines);
    this.options.log?.(`${line} room=${roomId}`);
  }

  private report(roomId: string, what: string, error: unknown): void {
    if (error instanceof RuntimeUnavailableError) return;
    const message = error instanceof CommandError ? `${error.code}: ${error.message}` : String(error);
    this.writeJournal(roomId, `[bot] ${what}: ${message}`);
  }
}
