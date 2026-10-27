import { mkdir, writeFile } from 'node:fs/promises';
import { memoryUsage } from 'node:process';
import { describe, expect, it, vi } from 'vitest';
import * as commands from '../../commands/gameplay';
import type { GameCommand } from '../../commands/gameplay';
import { botTaskOf, decideBotAction, type BotAction } from '../../bots/policy';
import { projectPrivatePlayerState, projectPublicRoomState } from '../../services/publicState';
import { recoverRoomIfDue } from '../../services/deadlineScheduler';
import { commitRoomCommand } from '../../socket/roomCommands';
import { addBot, appearance, connect, dataOf, join, okOf, ready, resume, start, startServer, stored, useHarnessCleanup } from '../../testing/teamHarness';
import * as rewards from './rewards';
import { OFFICIAL_POWER_UP_REGISTRY } from './catalog';

const entropy = vi.hoisted(() => ({ seed: 1, index(max: number) { this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0; return Math.floor(this.seed / 4294967296 * max); } }));
vi.mock('node:crypto', async importOriginal => ({ ...await importOriginal<typeof import('node:crypto')>(), randomInt: (upper: number) => entropy.index(upper) }));
useHarnessCleanup();
const seeds = [80801, 80802, 80803, 80804];
const limit = 20000;
function invocation(action: BotAction) {
  const table: Record<string, GameCommand<never, unknown>> = {
    'activate power up': commands.activatePowerUpCommand, 'roll dice': commands.rollDiceCommand,
    'buy property': commands.resolvePurchaseCommand, 'do not buy': commands.resolvePurchaseCommand,
    'resolve development': commands.resolveDevelopmentCommand, 'dismiss card': commands.dismissCardCommand,
    'draw card': commands.drawCardCommand, 'pay bail': commands.payBailCommand,
    'use jail card': commands.useJailCardCommand, 'wait in jail': commands.waitInJailCommand,
    'sell property to bank': commands.sellPropertyToBankCommand, 'accept forced sale': commands.acceptForcedSaleCommand,
    'reject forced sale': commands.rejectForcedSaleCommand, 'accept rescue': commands.acceptRescueCommand,
    'decline rescue': commands.declineRescueCommand, 'revive teammate': commands.reviveTeammateCommand,
    'accept offer': commands.acceptOfferCommand, 'decline offer': commands.declineOfferCommand,
  };
  const payload = ['buy property','do not buy'].includes(action.command) ? { ...(action.payload as object), buy: action.command === 'buy property' } : action.payload;
  return { command: table[action.command], payload: payload as never };
}

describe('08B reproducible full-game command endurance', () => {
  it('completes multiple seeded games with a human policy seat and three bots, with matched no-Power-up scenarios', async () => {
    const started = performance.now();
    const results: object[] = [];
    const latencies: number[] = [];
    const heapStart = memoryUsage(); let peakHeap = heapStart.heapUsed; let peakSnapshotBytes = 0;
    for (const enabled of [false, true]) for (const seed of seeds) {
      entropy.seed = seed;
      const diceRandom = vi.spyOn(Math, 'random').mockImplementation(() => entropy.index(0x1000000) / 0x1000000);
      const baseline = enabled ? null : vi.spyOn(rewards, 'issueStartReward').mockImplementation(() => {});
      const server = await startServer();
      const host = await join(await connect(server.url), 'Policy human', 'SOAK-' + seed + '-' + enabled);
      okOf(await appearance(host.socket, { characterId: 'dog' })); okOf(await ready(host.socket));
      for (let bot = 0; bot < 3; bot++) dataOf(await addBot(host.socket));
      okOf(await start(host.socket));
      const roomId = host.room.roomId;
      let now = Date.now(); let commandCount = 0; let recoveries = 0; let reconnects = 0; let maxStatuses = 0; let maxOffers = 0; let maxResolved = 0; let fullHandSamples = 0; let handSamples = 0;
      const phaseSamples: Record<string, {samples:number;totalCash:number;ownedProperties:number}> = {};
      const rentFlow = { playerPaid: 0, bankPaid: 0 }; let semanticSequence = 0;
      const activations: Record<string, number> = {}; const failures: string[] = [];
      const execute = async (command: GameCommand<never, unknown>, actor: string, payload: unknown) => {
        const tick = performance.now();
        await commands.runGameCommand(server.io, server.runtime, command, roomId, actor, payload as never, { now: new Date(now) });
        latencies.push(performance.now() - tick); commandCount++; now += 3000;
      };
      await commitRoomCommand(server.runtime, roomId, ({ state }) => { state.boardState.currentPlayer = { id: host.playerId, hasMoved: false }; });
      let room = await stored(server.runtime.persistence, roomId);
      const turnStart = room.gameSnapshot.gameState.boardState.turnNumber;
      const matchStart = performance.now();
      try {
        while (!room.gameSnapshot.gameState.boardState.winner && commandCount < limit) {
          const state = room.gameSnapshot.gameState;
          const pu = state.privateState.powerUps;
          for (const inventory of Object.values(pu?.inventories ?? {})) { handSamples++; if (inventory.cards.length >= 3) fullHandSamples++; }
          const phase = state.boardState.turnNumber < 40 ? 'early' : state.boardState.turnNumber < 120 ? 'middle' : 'late';
          const phaseSample = phaseSamples[phase] ??= {samples:0,totalCash:0,ownedProperties:0};phaseSample.samples++;phaseSample.totalCash += Object.values(state.players).reduce((sum,p)=>sum+p.accountBalance,0);phaseSample.ownedProperties += Object.keys(state.boardState.ownedProps).length;
          for(const event of state.boardState.gameplayEvents.events){if(event.sequence<=semanticSequence)continue;if(event.type==='MONEY_TRANSFER'&&event.reason==='RENT'){if(event.source.kind==='BANK')rentFlow.bankPaid+=event.amount;else rentFlow.playerPaid+=event.amount}}semanticSequence=state.boardState.gameplayEvents.sequence;
          maxStatuses = Math.max(maxStatuses, pu?.statuses?.length ?? 0); maxOffers = Math.max(maxOffers, pu?.rewardQueue.offers.length ?? 0); maxResolved = Math.max(maxResolved, pu?.resolvedReactionEventIds?.length ?? 0);
          if (commandCount % 50 === 0) { peakHeap = Math.max(peakHeap, memoryUsage().heapUsed); peakSnapshotBytes = Math.max(peakSnapshotBytes, Buffer.byteLength(JSON.stringify(room.gameSnapshot))); }
          if (pu?.pendingReaction) {
            const event = pu.pendingReaction; const actor = event.kind === 'ATTACK' ? event.defenderPlayerId : event.debtorPlayerId;
            await execute(commands.respondPowerUpCommand, actor, { eventId: event.eventId, action: 'PASS' });
          } else if (pu?.pendingTrade) {
            await execute(commands.resolvePowerUpTradeCommand, pu.pendingTrade.targetPlayerId, { requestId: pu.pendingTrade.requestId, accept: true });
          } else if (pu?.pendingMovement) {
            const movement = pu.pendingMovement; const cards = pu.inventories[movement.playerId]?.cards ?? [];
            const card = cards.find(card => ['U01','U02','U05','U08'].includes(card.definitionId));
            if (card) { const payload = { instanceId: card.instanceId, ...(card.definitionId === 'U05' ? { movementDelta: 3 } : card.definitionId === 'U08' ? { targetTileID: 39 } : {}) }; await execute(commands.activatePowerUpCommand, movement.playerId, payload); activations[card.definitionId] = (activations[card.definitionId] ?? 0) + 1; }
            else await execute(commands.continuePowerUpMovementCommand, movement.playerId, { operationId: movement.operationId });
          } else {
            const publicRoom = projectPublicRoomState(room, server.runtime.connections);
            const views = Object.keys(state.players).map(botId => ({ botId, room: publicRoom, self: projectPrivatePlayerState(room, botId), offers: [] }));
            const reward = views.find(view => view.self.powerUps?.activeOfferId);
            if (reward) {
              const offer = reward.self.powerUps!.offers.find(offer => offer.offerId === reward.self.powerUps!.activeOfferId)!;
              if (offer.selectedIndex === null) await execute(commands.selectPowerUpCommand, reward.botId, { offerId: offer.offerId, selectedIndex: entropy.index(3) });
              else { const full = (reward.self.powerUps!.inventory?.cards.length ?? 0) >= 3; const replace = reward.self.powerUps!.inventory?.cards[0]; await execute(commands.resolvePowerUpCommand, reward.botId, { offerId: offer.offerId, action: full ? 'REPLACE' : 'CLAIM', ...(full ? { replaceInstanceId: replace!.instanceId } : {}) }); }
            } else {
              const pending = views.map(view => ({ view, task: botTaskOf(view) })).find(item => item.task);
              if (pending?.task) {
                const decision = decideBotAction(pending.view, pending.task, () => entropy.index(0x1000000) / 0x1000000)!;
                const call = invocation(decision.action);
                try { await execute(call.command, pending.task.botId, call.payload); if (decision.action.command === 'activate power up') { const instance = pu?.inventories[pending.task.botId]?.cards.find(card => card.instanceId === (decision.action.payload as {instanceId:string}).instanceId); if(instance)activations[instance.definitionId]=(activations[instance.definitionId]??0)+1; } }
                catch (error) { failures.push(String(error)); const fallback = invocation(decision.fallback); await execute(fallback.command, pending.task.botId, fallback.payload); }
              } else {
                if (!room.nextActionAt) throw new Error('Deadlock with no command or server deadline: ' + JSON.stringify({ board: publicRoom.gameState.boardState, turn: state.turnInfo }));
                now = Math.max(now, room.nextActionAt.getTime()); await recoverRoomIfDue(server.io, server.runtime, roomId, new Date(now)); recoveries++; commandCount++; now += 3000;
              }
            }
          }
          room = await stored(server.runtime.persistence, roomId);
          if (commandCount > 0 && commandCount % 200 === 0 && room.gameSnapshot.gameState.players[host.playerId]) {
            host.socket.disconnect(); await vi.waitFor(() => expect(server.runtime.connections.isConnected(host.playerId)).toBe(false));
            host.socket = await connect(server.url); await resume(host.socket, host.token); reconnects++;
            room = await stored(server.runtime.persistence, roomId);
          }
        }
        const final = room.gameSnapshot.gameState;
        results.push({ seed, powerUps: enabled, completed: Boolean(final.boardState.winner), commands: commandCount, turns: final.boardState.turnNumber - turnStart, wallMs: Math.round(performance.now()-matchStart), recoveries, reconnects, rejectedChoices: failures, activations, fullHandSamples, handSamples, phaseSamples, rentFlow, generatedLegendaryCandidates:(final.privateState.powerUps?.rewardQueue.offers??[]).flatMap(o=>o.candidates).filter(c=>OFFICIAL_POWER_UP_REGISTRY.get(c.definitionId).rarity==='LEGENDARY').length, maxStatuses, maxOffers, maxResolvedReactionIds:maxResolved, finalSnapshotBytes: Buffer.byteLength(JSON.stringify(room.gameSnapshot)), finalPending: Boolean(final.privateState.powerUps?.pendingReaction || final.privateState.powerUps?.pendingMovement || final.privateState.powerUps?.pendingTrade), finalStatuses:final.privateState.powerUps?.statuses?.length??0 });
        expect(final.boardState.winner, 'seed=' + seed + ' powerUps=' + enabled + ' command limit=' + limit).toBeTruthy();
        expect(final.privateState.powerUps?.pendingReaction).toBeFalsy();expect(final.privateState.powerUps?.pendingMovement).toBeFalsy();expect(final.privateState.powerUps?.statuses??[]).toEqual([]);expect(maxResolved).toBeLessThanOrEqual(256);
      } finally { diceRandom.mockRestore(); baseline?.mockRestore(); await server.close(); }
    }
    latencies.sort((a,b)=>a-b);
    const report = { method: 'Complete server-authoritative games through runGameCommand and recoverRoomIfDue. One connected human seat uses the existing bot policy; three real bot seats. Human reactions pass. Baseline harness suppresses START Power-up offer issuance only, without changing product code. Virtual clock advances 3s per decision and jumps to actual pending deadlines.', seeds, commandLimitPerMatch:limit, matches:results, wallMs:Math.round(performance.now()-started), commandLatencyMs:{samples:latencies.length,p50:latencies[Math.floor(latencies.length*.5)],p95:latencies[Math.floor(latencies.length*.95)],max:latencies.at(-1)}, memory:{start:heapStart,end:memoryUsage(),peakSampledHeapBytes:peakHeap,limitation:'Process heap includes the Vitest runner and uncollected garbage; this is an observed high-water mark, not proof of leak freedom.'},peakSnapshotBytes };
    await mkdir('../../test-results/powerup-08b', {recursive:true});await writeFile('../../test-results/powerup-08b/endurance.json', JSON.stringify(report,null,2));
    console.log('08B_ENDURANCE ' + JSON.stringify(report));
  },180000);
});
