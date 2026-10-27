import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { privatePlayerStateSchema, type PrivatePlayerState, type PublicRoomState, type JoinRoomResult } from '@monopoly/shared';
import { ack, addBot, appearance, connect, dataOf, join, mutateRoom, okOf, ready, resume, start, startServer, stored, useHarnessCleanup } from './testing/teamHarness';
import { commitRoomCommand } from './socket/roomCommands';
import { broadcastRoom } from './socket/broadcast';
import { projectPrivatePlayerState, projectPublicRoomState } from './services/publicState';
import { recoverRoomIfDue } from './services/deadlineScheduler';
import { moveBy } from './game/dice';
import { completeTurnResolution, continuationForRoll } from './game/turn';
import { resolveTile } from './game/tiles';
import { createPowerUpInventory, createPowerUpState } from './game/powerUps/foundation';

useHarnessCleanup();
let counter = 0;
async function fixture(bot = false) {
  const subject = await startServer(); const code = 'POWER-' + (++counter);
  const host = await join(await connect(subject.url), 'Host', code);
  const guest = await join(await connect(subject.url), 'Guest', code);
  okOf(await appearance(host.socket, { characterId: 'dog' })); okOf(await appearance(guest.socket, { characterId: 'cat' }));
  const botId = bot ? dataOf(await addBot(host.socket)).playerId : undefined;
  okOf(await ready(host.socket)); okOf(await ready(guest.socket)); okOf(await start(host.socket));
  const roomId = host.room.roomId;
  await mutateRoom(subject.runtime.persistence, roomId, room => {
    room.gameSnapshot.gameState.boardState.currentPlayer = { id: host.playerId, hasMoved: false };
    room.gameSnapshot.gameState.turnInfo = {};
  });
  const room = () => stored(subject.runtime.persistence, roomId);
  const offer = async () => (await room()).gameSnapshot.gameState.privateState.powerUps!.rewardQueue.offers.filter(o => o.stage !== 'COMPLETED')[0];
  const trigger = async (owner = host.playerId, count = 1) => {
    const result = await commitRoomCommand(subject.runtime, roomId, ({ state }) => {
      state.boardState.currentPlayer = { id: owner, hasMoved: true }; state.turnInfo = {};
      for (let i = 0; i < count; i++) { state.players[owner].currentTile = 39; moveBy(state, owner, 1); }
      // The actual turn gateway is exercised by roll dice in the full-flow test.
    });
    broadcastRoom(subject.io, subject.runtime, result.room!); return result.room!;
  };
  const select = (offerId: string, selectedIndex = 0, socket = host.socket) => ack(cb => socket.emit('select power up', { offerId, selectedIndex }, cb));
  const resolve = (offerId: string, action: 'CLAIM' | 'DECLINE' = 'CLAIM', socket = host.socket) => ack(cb => socket.emit('resolve power up', { offerId, action }, cb));
  return { subject, host, guest, botId, roomId, room, offer, trigger, select, resolve };
}

describe('live START reward Socket.IO protocol', () => {
  it('activates a property effect through the authenticated socket and keeps its status private', async () => {
    const f = await fixture();
    const instanceId = randomUUID();
    await mutateRoom(f.subject.runtime.persistence, f.roomId, room => {
      room.gameSnapshot.gameState.boardState.currentPlayer = { id: f.host.playerId, hasMoved: false };
      room.gameSnapshot.gameState.boardState.ownedProps[1] = { id: f.host.playerId, color: 'red', houses: 0 };
      const powerUps = room.gameSnapshot.gameState.privateState.powerUps ??= createPowerUpState();
      powerUps.inventories[f.host.playerId] = createPowerUpInventory(3);
      powerUps.inventories[f.guest.playerId] = createPowerUpInventory(3);
      powerUps.inventories[f.host.playerId].cards.push({
        instanceId, ownerPlayerId: f.host.playerId, definitionId: 'A02', obtainedFromOfferId: randomUUID(),
      });
    });
    okOf(await ack(cb => f.host.socket.emit('activate power up', { instanceId, targetTileID: 1 }, cb)));
    const room = await f.room();
    expect(room.gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards).toHaveLength(0);
    expect(room.gameSnapshot.gameState.privateState.powerUps!.statuses).toMatchObject([
      { definitionId: 'A02', kind: 'RENT_MODIFIER', targetTileID: 1, remainingOwnerTurns: 2, remainingUses: 1 },
    ]);
    const ownerState = projectPrivatePlayerState(room, f.host.playerId);
    const guestState = projectPrivatePlayerState(room, f.guest.playerId);
    expect(privatePlayerStateSchema.safeParse(ownerState).success).toBe(true);
    expect(ownerState.powerUps?.statuses).toHaveLength(1);
    expect(guestState.powerUps?.statuses).toHaveLength(0);
    expect(ownerState.powerUps?.activeUsedThisTurn).toBe(true);
  });

  it('delivers an attack Reaction only to its target and accepts the defender response once', async () => {
    const f = await fixture();
    const attackId = randomUUID(); const defenseId = randomUUID();
    await mutateRoom(f.subject.runtime.persistence, f.roomId, room => {
      room.gameSnapshot.gameState.boardState.currentPlayer = { id: f.host.playerId, hasMoved: false };
      const powerUps = room.gameSnapshot.gameState.privateState.powerUps ??= createPowerUpState();
      powerUps.inventories[f.host.playerId] = createPowerUpInventory(3);
      powerUps.inventories[f.guest.playerId] = createPowerUpInventory(3);
      powerUps.inventories[f.host.playerId].cards.push({
        instanceId: attackId, ownerPlayerId: f.host.playerId, definitionId: 'A05', obtainedFromOfferId: randomUUID(),
      });
      powerUps.inventories[f.guest.playerId].cards.push({
        instanceId: defenseId, ownerPlayerId: f.guest.playerId, definitionId: 'D03', obtainedFromOfferId: randomUUID(),
      });
    });
    okOf(await ack(cb => f.host.socket.emit('activate power up', { instanceId: attackId, targetPlayerId: f.guest.playerId }, cb)));
    const pending = await f.room();
    const defender = projectPrivatePlayerState(pending, f.guest.playerId).powerUps?.reaction;
    expect(defender?.kind).toBe('ATTACK');
    expect(defender?.eligibleInstanceIds).toEqual([defenseId]);
    expect(projectPrivatePlayerState(pending, f.host.playerId).powerUps?.reaction).toBeNull();
    okOf(await ack(cb => f.guest.socket.emit('respond power up', {
      eventId: defender!.eventId, action: 'REACT', instanceId: defenseId,
    }, cb)));
    const resolved = await f.room();
    expect(resolved.gameSnapshot.gameState.privateState.powerUps!.pendingReaction).toBeNull();
    expect(resolved.gameSnapshot.gameState.privateState.powerUps!.statuses).toHaveLength(0);
    expect(resolved.gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards).toHaveLength(0);
    expect(resolved.gameSnapshot.gameState.privateState.powerUps!.inventories[f.guest.playerId].cards).toHaveLength(0);
  });

  it('expires a Reaction at its saved deadline and resolves the attack exactly once', async () => {
    const f = await fixture();
    const attackId = randomUUID(); const defenseId = randomUUID();
    await mutateRoom(f.subject.runtime.persistence, f.roomId, room => {
      room.gameSnapshot.gameState.boardState.currentPlayer = { id: f.host.playerId, hasMoved: false };
      const powerUps = room.gameSnapshot.gameState.privateState.powerUps ??= createPowerUpState();
      powerUps.inventories[f.host.playerId] = createPowerUpInventory(3);
      powerUps.inventories[f.guest.playerId] = createPowerUpInventory(3);
      powerUps.inventories[f.host.playerId].cards.push({
        instanceId: attackId, ownerPlayerId: f.host.playerId, definitionId: 'A05', obtainedFromOfferId: randomUUID(),
      });
      powerUps.inventories[f.guest.playerId].cards.push({
        instanceId: defenseId, ownerPlayerId: f.guest.playerId, definitionId: 'D03', obtainedFromOfferId: randomUUID(),
      });
    });
    okOf(await ack(cb => f.host.socket.emit('activate power up', { instanceId: attackId, targetPlayerId: f.guest.playerId }, cb)));
    const pending = await f.room();
    const deadline = pending.gameSnapshot.gameState.privateState.powerUps!.pendingReaction!.deadlineAt;
    await recoverRoomIfDue(f.subject.io, f.subject.runtime, f.roomId, new Date(Date.parse(deadline) - 1));
    expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.pendingReaction).toBeTruthy();
    await recoverRoomIfDue(f.subject.io, f.subject.runtime, f.roomId, new Date(Date.parse(deadline) + 1));
    const resolved = await f.room();
    expect(resolved.gameSnapshot.gameState.privateState.powerUps!.pendingReaction).toBeNull();
    expect(resolved.gameSnapshot.gameState.privateState.powerUps!.statuses).toMatchObject([
      { definitionId: 'A05', kind: 'BUILD_RESTRICTION', targetPlayerId: f.guest.playerId },
    ]);
    expect(resolved.gameSnapshot.gameState.privateState.powerUps!.inventories[f.guest.playerId].cards).toHaveLength(1);
  });

  it('auto-passes bot reactions inside the same authoritative command', async () => {
    const f = await fixture(true);
    const attackId = randomUUID();
    await mutateRoom(f.subject.runtime.persistence, f.roomId, room => {
      room.gameSnapshot.gameState.boardState.currentPlayer = { id: f.host.playerId, hasMoved: false };
      const powerUps = room.gameSnapshot.gameState.privateState.powerUps ??= createPowerUpState();
      powerUps.inventories[f.host.playerId] = createPowerUpInventory(3);
      powerUps.inventories[f.botId! ] = createPowerUpInventory(3);
      powerUps.inventories[f.host.playerId].cards.push({
        instanceId: attackId, ownerPlayerId: f.host.playerId, definitionId: 'A05', obtainedFromOfferId: randomUUID(),
      });
      powerUps.inventories[f.botId!].cards.push({
        instanceId: randomUUID(), ownerPlayerId: f.botId!, definitionId: 'D03', obtainedFromOfferId: randomUUID(),
      });
    });
    okOf(await ack(cb => f.host.socket.emit('activate power up', { instanceId: attackId, targetPlayerId: f.botId }, cb)));
    const resolved = await f.room();
    expect(resolved.gameSnapshot.gameState.privateState.powerUps!.pendingReaction).toBeNull();
    expect(resolved.gameSnapshot.gameState.privateState.powerUps!.statuses).toMatchObject([
      { definitionId: 'A05', kind: 'BUILD_RESTRICTION', targetPlayerId: f.botId },
    ]);
  });

  it('runs a multiplayer dice START -> hidden offer -> reveal -> claim -> turn handoff with private packets', async () => {
    const f = await fixture(); const privatePackets: PrivatePlayerState[] = []; const opponentPackets: PrivatePlayerState[] = []; const publicPackets: PublicRoomState[] = [];
    f.host.socket.on('private player state', p => privatePackets.push(p)); f.guest.socket.on('private player state', p => opponentPackets.push(p)); f.guest.socket.on('update', p => publicPackets.push(p));
    const before = await f.room();
    await mutateRoom(f.subject.runtime.persistence, f.roomId, room => { room.gameSnapshot.gameState.players[f.host.playerId].currentTile = 38; });
    const roll = vi.spyOn(Math, 'random').mockReturnValue(0);
    try { okOf(await ack(cb => f.host.socket.emit('roll dice', cb))); } finally { roll.mockRestore(); }
    const awarded = await f.room(); const state = awarded.gameSnapshot.gameState; const offer = await f.offer();
    expect(state.players[f.host.playerId].accountBalance).toBe(before.gameSnapshot.gameState.players[f.host.playerId].accountBalance + 200);
    expect(state.privateState.powerUps!.rewardQueue.offers).toHaveLength(1);
    expect(offer.offerId).toBe(state.boardState.gameplayEvents.events.find(e=>e.type==='PASS_GO')!.eventId);
    expect(state.boardState.currentPlayer.id).toBe(f.host.playerId);
    await vi.waitFor(()=>expect(privatePackets.some(p=>p.powerUps?.activeOfferId===offer.offerId)).toBe(true));
    const hidden = privatePackets.find(p=>p.powerUps?.activeOfferId===offer.offerId)!;
    expect(hidden.powerUps!.offers[0].candidates).toEqual([{ category:'ATTACK' },{ category:'DEFENSE' },{ category:'UTILITY' }]);
    expect(JSON.stringify(hidden.powerUps)).not.toMatch(/definitionId|rarity|effectKey|description/);
    expect((await ack(cb=>f.host.socket.emit('roll dice',cb))).ok).toBe(false);
    okOf(await f.select(offer.offerId,1));
    const revealed = projectPrivatePlayerState(await f.room(),f.host.playerId);
    expect(revealed.powerUps!.offers[0].candidates.every(c=>c.definition)).toBe(true);
    expect(privatePlayerStateSchema.safeParse(revealed).success).toBe(true);
    okOf(await f.resolve(offer.offerId)); okOf(await f.resolve(offer.offerId));
    const completed = await f.room();
    expect(completed.gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards).toHaveLength(1);
    expect(completed.gameSnapshot.gameState.boardState.currentPlayer.id).toBe(f.guest.playerId);
    await vi.waitFor(()=>expect(opponentPackets.length).toBeGreaterThan(0));
    for(const p of opponentPackets) expect(JSON.stringify(p.powerUps)).not.toMatch(/definitionId|instanceId|rarity|effectKey|offerId/);
    for(const p of publicPackets) expect(JSON.stringify(p)).not.toMatch(/definitionId|instanceId|candidates|rewardQueue|offlineDeadlines/);
    const summary=projectPublicRoomState(completed,f.subject.runtime.connections).gameState.players[f.host.playerId].powerUps;
    expect(summary).toEqual({ count:1,categories:{ ATTACK:0,DEFENSE:1,UTILITY:0 } });
    const spectator=await connect(f.subject.url); const view=dataOf(await ack<JoinRoomResult>(cb=>spectator.emit('join room',{ name:'Spectator',roomCode:f.host.room.roomCode },cb)));
    expect(view.kind).toBe('SPECTATOR'); expect(JSON.stringify(view)).not.toMatch(/definitionId|instanceId|candidates|rewardQueue/);
    expect((await f.select(offer.offerId,0,spectator)).ok).toBe(false);
  });
  it('rejects malformed, unauthenticated, foreign and out-of-order commands and serializes racing selections',async()=>{
    const f=await fixture(); await f.trigger(f.host.playerId,2); const offer=await f.offer(); const before=await f.room();
    const stranger=await connect(f.subject.url); expect((await f.select(offer.offerId,0,stranger)).ok).toBe(false);
    expect((await f.select(offer.offerId,0,f.guest.socket)).ok).toBe(false);
    for(const index of [-1,3,1.2]) expect((await f.select(offer.offerId,index)).ok).toBe(false);
    const later=before.gameSnapshot.gameState.privateState.powerUps!.rewardQueue.offers[1]; expect((await f.select(later.offerId)).ok).toBe(false);
    expect((await f.room()).aggregateVersion).toBe(before.aggregateVersion);
    const raced=await Promise.all([f.select(offer.offerId,0),f.select(offer.offerId,1)]); expect(raced.filter(a=>a.ok)).toHaveLength(1);
    const locked=(await f.offer()).selectedIndex!; okOf(await f.select(offer.offerId,locked));
    await Promise.all([f.resolve(offer.offerId),f.resolve(offer.offerId)]);
    expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards).toHaveLength(1);
    expect((await f.offer()).offerId).toBe(later.offerId);
  });
  it('restores identical category backs and locked reveal on reconnect, then restores the committed outcome',async()=>{
    const f=await fixture(); await f.trigger(); const offer=await f.offer(); const candidates=structuredClone(offer.candidates);
    f.host.socket.disconnect(); await vi.waitFor(()=>expect(f.subject.runtime.connections.isConnected(f.host.playerId)).toBe(false));
    let socket=await connect(f.subject.url); let restored=await resume(socket,f.host.token);
    expect(restored.privatePlayerState.powerUps!.offers[0].candidates).toEqual(candidates.map(c=>({category:c.category})));
    okOf(await f.select(offer.offerId,2,socket)); socket.disconnect();
    await vi.waitFor(()=>expect(f.subject.runtime.connections.isConnected(f.host.playerId)).toBe(false));
    socket=await connect(f.subject.url); restored=await resume(socket,f.host.token);
    expect(restored.privatePlayerState.powerUps!.offers[0]).toMatchObject({ stage:'REVEALED',selectedIndex:2 });
    expect(restored.privatePlayerState.powerUps!.offers[0].candidates.map(c=>c.definition!.definitionId)).toEqual(candidates.map(c=>c.definitionId));
    okOf(await f.resolve(offer.offerId,'CLAIM',socket)); socket.disconnect();
    await vi.waitFor(()=>expect(f.subject.runtime.connections.isConnected(f.host.playerId)).toBe(false));
    socket=await connect(f.subject.url); restored=await resume(socket,f.host.token);
    expect(restored.privatePlayerState.powerUps!.offers[0]).toMatchObject({stage:'COMPLETED',outcome:{kind:'GRANTED'}});
    expect(restored.privatePlayerState.powerUps!.inventory!.cards).toHaveLength(1); expect(restored.privatePlayerState.powerUps!.activeOfferId).toBeNull();
  });
  it('supports three held cards, mandatory replacement or decline, and idempotent completion',async()=>{
    const f=await fixture();
    for(let i=0;i<3;i++){await f.trigger();const offer=await f.offer();okOf(await f.select(offer.offerId));okOf(await f.resolve(offer.offerId));}
    const original=(await f.room()).gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards;
    await f.trigger();let offer=await f.offer();okOf(await f.select(offer.offerId));okOf(await f.resolve(offer.offerId));
    expect((await f.offer()).stage).toBe('INVENTORY_RESOLUTION');
    expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards).toEqual(original);
    expect((await ack(cb=>f.host.socket.emit('resolve power up',{offerId:offer.offerId,action:'REPLACE',replaceInstanceId:randomUUID()},cb))).ok).toBe(false);
    okOf(await ack(cb=>f.host.socket.emit('resolve power up',{offerId:offer.offerId,action:'REPLACE',replaceInstanceId:original[0].instanceId},cb)));
    const replaced=(await f.room()).gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards;
    expect(replaced).toHaveLength(3); expect(replaced.slice(0,2)).toEqual(original.slice(1));
    await f.trigger();offer=await f.offer();okOf(await f.select(offer.offerId));okOf(await f.resolve(offer.offerId,'DECLINE'));
    expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards).toEqual(replaced);
  });
  it.each([false,true])('offline recovery uses the configured grace and completes without rearming (full=%s)',async full=>{
    const f=await fixture(); await f.trigger(f.host.playerId,2);
    if(full) await mutateRoom(f.subject.runtime.persistence,f.roomId,room=>{
      room.gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards=Array.from({length:3},()=>({instanceId:randomUUID(),ownerPlayerId:f.host.playerId,definitionId:'A08',obtainedFromOfferId:randomUUID()}));
    });
    const old=(await f.room()).gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards;
    f.host.socket.disconnect();
    await vi.waitFor(async()=>expect((await f.room()).gameSnapshot.gameState.boardState.turnRecovery).toBeTruthy());
    const armed=await f.room(); const deadline=armed.gameSnapshot.gameState.boardState.turnRecovery!.deadlineAt;
    const due=new Date(Date.parse(deadline)+1);
    await recoverRoomIfDue(f.subject.io,f.subject.runtime,f.roomId,new Date(Date.parse(deadline)-1));
    expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.rewardQueue.offers.every(o=>o.stage==='WAITING')).toBe(true);
    await Promise.all([recoverRoomIfDue(f.subject.io,f.subject.runtime,f.roomId,due),recoverRoomIfDue(f.subject.io,f.subject.runtime,f.roomId,due)]);
    const after=await f.room(); const pu=after.gameSnapshot.gameState.privateState.powerUps!;
    expect(pu.rewardQueue.offers.every(o=>o.stage==='COMPLETED')).toBe(true);
    expect(pu.rewardQueue.offers.every(o=>o.outcome?.kind===(full?'DISCARDED_FULL':'GRANTED'))).toBe(true);
    expect(pu.inventories[f.host.playerId].cards).toHaveLength(full?3:2);
    if(full)expect(pu.inventories[f.host.playerId].cards).toEqual(old);
    expect(after.gameSnapshot.gameState.boardState.turnRecovery).toBeNull(); expect(pu.offlineDeadlines).toEqual({});
    await recoverRoomIfDue(f.subject.io,f.subject.runtime,f.roomId,new Date(due.getTime()+120000));
    expect((await f.room()).aggregateVersion).toBe(after.aggregateVersion);
  });
  it('resolves a bot reward via the shared server claim path and never waits for a bot modal',async()=>{
    const f=await fixture(true); await f.trigger(f.botId,4);
    const state=(await f.room()).gameSnapshot.gameState; const pu=state.privateState.powerUps!;
    expect(pu.rewardQueue.offers.every(o=>o.stage==='COMPLETED')).toBe(true); expect(pu.inventories[f.botId!].cards).toHaveLength(3);
    expect(pu.rewardQueue.offers[3].outcome?.kind).toBe('DISCARDED_FULL');
  });
  it('rolls back the live cash/offer/revision and emits no reward if transaction save fails',async()=>{
    const f=await fixture(); await mutateRoom(f.subject.runtime.persistence,f.roomId,room=>{room.gameSnapshot.gameState.players[f.host.playerId].currentTile=38;});
    const before=await f.room(); const packets:PrivatePlayerState[]=[]; f.host.socket.on('private player state',p=>packets.push(p));
    const persistence=f.subject.runtime.persistence; const transaction=persistence.transaction.bind(persistence);
    const spy=vi.spyOn(persistence,'transaction').mockImplementationOnce(callback=>transaction(async tx=>{
      const save=vi.spyOn(tx.rooms,'save').mockRejectedValueOnce(new Error('injected save failure'));
      try{return await callback(tx);}finally{save.mockRestore();}
    }));
    const random=vi.spyOn(Math,'random').mockReturnValue(0);
    try{const rejected=await ack(cb=>f.host.socket.emit('roll dice',cb));expect(rejected.ok).toBe(false);}finally{spy.mockRestore();random.mockRestore();}
    expect(await f.room()).toEqual(before); expect(packets.some(p=>p.powerUps?.offers.length)).toBe(false);
    const retry=vi.spyOn(Math,'random').mockReturnValue(0);
    try{okOf(await ack(cb=>f.host.socket.emit('roll dice',cb)));}finally{retry.mockRestore();}
    expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.rewardQueue.offers).toHaveLength(1);
  });
  it('does not let an offline noncurrent owner block another player and recovers that owner on their own deadline',async()=>{
    const f=await fixture();await f.trigger(f.guest.playerId);await f.trigger(f.host.playerId);
    const offers=(await f.room()).gameSnapshot.gameState.privateState.powerUps!.rewardQueue.offers;
    f.guest.socket.disconnect();
    await vi.waitFor(async()=>expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.offlineDeadlines?.[f.guest.playerId]).toBeTruthy());
    const deadline=(await f.room()).gameSnapshot.gameState.privateState.powerUps!.offlineDeadlines![f.guest.playerId];
    okOf(await f.select(offers[1].offerId));okOf(await f.resolve(offers[1].offerId));
    expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.rewardQueue.offers[0].stage).toBe('WAITING');
    await recoverRoomIfDue(f.subject.io,f.subject.runtime,f.roomId,new Date(Date.parse(deadline)+1));
    const state=(await f.room()).gameSnapshot.gameState;expect(state.privateState.powerUps!.rewardQueue.offers.every(o=>o.stage==='COMPLETED')).toBe(true);
    expect(state.boardState.currentPlayer.id).toBe(f.host.playerId);expect(state.privateState.powerUps!.offlineDeadlines).toEqual({});
  });
  it('reconnecting a noncurrent owner clears the old recovery marker and preserves the exact stored offer',async()=>{
    const f=await fixture();await f.trigger(f.guest.playerId);await f.trigger(f.host.playerId);f.guest.socket.disconnect();
    await vi.waitFor(async()=>expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.offlineDeadlines?.[f.guest.playerId]).toBeTruthy());
    const before=(await f.room()).gameSnapshot.gameState.privateState.powerUps!;const oldDeadline=before.offlineDeadlines![f.guest.playerId];
    const socket=await connect(f.subject.url);await resume(socket,f.guest.token);
    expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.offlineDeadlines?.[f.guest.playerId]).toBeUndefined();
    await recoverRoomIfDue(f.subject.io,f.subject.runtime,f.roomId,new Date(Date.parse(oldDeadline)+1));
    expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.rewardQueue.offers[0]).toEqual(before.rewardQueue.offers[0]);
  });
  it('finishes a property purchase decision before offering START selection, then resumes the same turn',async()=>{
    const f=await fixture();await commitRoomCommand(f.subject.runtime,f.roomId,({state})=>{
      state.players[f.host.playerId].currentTile=39;state.boardState.currentPlayer.hasMoved=true;
      moveBy(state,f.host.playerId,2);resolveTile(state,f.host.playerId,2,continuationForRoll(state,f.host.playerId));
    });
    const before=await f.room();const offer=await f.offer();const purchase=before.gameSnapshot.gameState.turnInfo.pendingPropertyDecision!;
    expect(purchase).toBeTruthy();expect(projectPrivatePlayerState(before,f.host.playerId).powerUps!.activeOfferId).toBeNull();
    expect((await f.select(offer.offerId)).ok).toBe(false);
    okOf(await ack(cb=>f.host.socket.emit('do not buy',{operationId:purchase.operationId},cb)));
    expect(projectPrivatePlayerState(await f.room(),f.host.playerId).powerUps!.activeOfferId).toBe(offer.offerId);
    okOf(await f.select(offer.offerId));okOf(await f.resolve(offer.offerId));
    expect((await f.room()).gameSnapshot.gameState.boardState.currentPlayer.id).toBe(f.guest.playerId);
  });
  it.each([['chance',7,'chance-dividend'],['chest',2,'chest-inheritance']] as const)('finishes %s interaction before START selection without altering its card effect',async(deck,tile,cardId)=>{
    const f=await fixture();await commitRoomCommand(f.subject.runtime,f.roomId,({state})=>{
      const pile=state.privateState.decks[deck].drawPile;state.privateState.decks[deck].drawPile=[cardId,...pile.filter(id=>id!==cardId)];
      state.players[f.host.playerId].currentTile=39;state.boardState.currentPlayer.hasMoved=true;moveBy(state,f.host.playerId,tile+1);
      resolveTile(state,f.host.playerId,tile+1,continuationForRoll(state,f.host.playerId),{now:Date.now()-4000});
    });
    const before=await f.room();const pending=before.gameSnapshot.gameState.turnInfo.pendingCardInteraction!;const offer=await f.offer();
    expect(pending.deck).toBe(deck);expect(pending.revealedCardId).toBe(cardId);
    expect((await f.select(offer.offerId)).ok).toBe(false);
    okOf(await ack(cb=>f.host.socket.emit('dismiss card',{operationId:pending.operationId},cb)));
    expect(projectPrivatePlayerState(await f.room(),f.host.playerId).powerUps!.activeOfferId).toBe(offer.offerId);
    okOf(await f.select(offer.offerId));okOf(await f.resolve(offer.offerId));
    expect((await f.room()).gameSnapshot.gameState.boardState.currentPlayer.id).toBe(f.guest.playerId);
  });
  it('recovery after reveal preserves the locked selection, completes its continuation, and cannot reclaim after resume',async()=>{
    const f=await fixture();await f.trigger();const offer=await f.offer();okOf(await f.select(offer.offerId,1));
    await commitRoomCommand(f.subject.runtime,f.roomId,({state})=>completeTurnResolution(state,continuationForRoll(state,f.host.playerId)));
    f.host.socket.disconnect();await vi.waitFor(async()=>expect((await f.room()).gameSnapshot.gameState.boardState.turnRecovery).toBeTruthy());
    const due=new Date(Date.parse((await f.room()).gameSnapshot.gameState.boardState.turnRecovery!.deadlineAt)+1);
    await recoverRoomIfDue(f.subject.io,f.subject.runtime,f.roomId,due);
    const socket=await connect(f.subject.url);const resumed=await resume(socket,f.host.token);
    expect(resumed.privatePlayerState.powerUps!.offers[0]).toMatchObject({stage:'COMPLETED',selectedIndex:1,outcome:{automatic:true,kind:'GRANTED'}});
    okOf(await f.resolve(offer.offerId,'CLAIM',socket));expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.inventories[f.host.playerId].cards).toHaveLength(1);
    expect((await f.room()).gameSnapshot.gameState.boardState.currentPlayer.id).toBe(f.guest.playerId);
  });

  it('recovers an offer created by classic-card movement during an expired disconnect recovery without starting another grace period',async()=>{
    const f=await fixture();await commitRoomCommand(f.subject.runtime,f.roomId,({state})=>{
      const cardId='chance-advance-start';const pile=state.privateState.decks.chance.drawPile;
      state.privateState.decks.chance.drawPile=[cardId,...pile.filter(id=>id!==cardId)];
      state.players[f.host.playerId].currentTile=7;state.boardState.currentPlayer.hasMoved=true;
      resolveTile(state,f.host.playerId,0,continuationForRoll(state,f.host.playerId),{now:Date.now()-4000});
    });
    f.host.socket.disconnect();await vi.waitFor(async()=>expect((await f.room()).gameSnapshot.gameState.boardState.turnRecovery).toBeTruthy());
    const due=new Date(Date.parse((await f.room()).gameSnapshot.gameState.boardState.turnRecovery!.deadlineAt)+1);
    await recoverRoomIfDue(f.subject.io,f.subject.runtime,f.roomId,due);
    const state=(await f.room()).gameSnapshot.gameState;
    expect(state.players[f.host.playerId].accountBalance).toBe(1700);
    expect(state.privateState.powerUps!.rewardQueue.offers).toHaveLength(1);
    expect(state.privateState.powerUps!.rewardQueue.offers[0]).toMatchObject({stage:'COMPLETED',outcome:{automatic:true,kind:'GRANTED'}});
    expect(state.boardState.currentPlayer.id).toBe(f.guest.playerId);
    expect(state.privateState.powerUps!.offlineDeadlines).toEqual({});expect(state.boardState.turnRecovery).toBeNull();
  });
  it('serializes reconnect against a due recovery so either restored or automatic choice can grant only once',async()=>{
    const f=await fixture();await f.trigger();const offer=await f.offer();
    f.host.socket.disconnect();await vi.waitFor(async()=>expect((await f.room()).gameSnapshot.gameState.boardState.turnRecovery).toBeTruthy());
    const deadline=(await f.room()).gameSnapshot.gameState.boardState.turnRecovery!.deadlineAt;const socket=await connect(f.subject.url);
    await Promise.all([recoverRoomIfDue(f.subject.io,f.subject.runtime,f.roomId,new Date(Date.parse(deadline)+1)),resume(socket,f.host.token)]);
    const live=(await f.room()).gameSnapshot.gameState.privateState.powerUps!.rewardQueue.offers[0];
    if(live.stage!=='COMPLETED'){okOf(await f.select(offer.offerId,0,socket));okOf(await f.resolve(offer.offerId,'CLAIM',socket));}
    okOf(await f.resolve(offer.offerId,'CLAIM',socket));
    const pu=(await f.room()).gameSnapshot.gameState.privateState.powerUps!;
    expect(pu.rewardQueue.offers).toHaveLength(1);expect(pu.inventories[f.host.playerId].cards).toHaveLength(1);
    expect(pu.rewardQueue.offers[0].stage).toBe('COMPLETED');
  });

});
