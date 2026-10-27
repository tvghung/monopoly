import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { type GameState, type LeaveRoomResult, type PowerUpActivationRequest, type PowerUpReactionRequest } from '@monopoly/shared';
import { ack, addBot, appearance, connect, dataOf, join, mutateRoom, okOf, ready, resume, start, startServer, stored, useHarnessCleanup } from './testing/teamHarness';
import { createPowerUpInventory, createPowerUpState } from './game/powerUps/foundation';
import { activationCasesFor, putCard } from './game/powerUps/testFixtures';
import { OFFICIAL_POWER_UP_DEFINITIONS, OFFICIAL_POWER_UP_REGISTRY } from './game/powerUps/catalog';
import { activatePowerUp } from './game/powerUps/runtime';
import { createPowerUpRentEvent, openPowerUpRentReaction, purchaseBasePrice } from './game/powerUps/economy';
import { enqueuePayments } from './game/payment';
import { progressPaymentQueue } from './game/paymentResolution';
import { status } from './game/powerUps/testFixtures';
import { hydrateGameState, storeGameState } from './rooms';
import { commitRoomCommand } from './socket/roomCommands';
import { recoverRoomIfDue } from './services/deadlineScheduler';
import { projectPrivatePlayerState, projectPublicRoomState } from './services/publicState';

useHarnessCleanup();
let serial = 0;
async function fixture(id: string, thirdPlayer = false) {
  const server = await startServer();
  const code = 'ALL-CARDS-' + (++serial);
  const owner = await join(await connect(server.url), 'Owner', code);
  const other = await join(await connect(server.url), 'Other', code);
  okOf(await appearance(owner.socket, { characterId: 'dog' }));
  okOf(await appearance(other.socket, { characterId: 'cat' }));
  if (thirdPlayer) dataOf(await addBot(owner.socket));
  okOf(await ready(owner.socket)); okOf(await ready(other.socket)); okOf(await start(owner.socket));
  const roomId = owner.room.roomId;
  let request: PowerUpActivationRequest | PowerUpReactionRequest;
  let instanceId = '';
  const definition = OFFICIAL_POWER_UP_REGISTRY.get(id);
  await mutateRoom(server.runtime.persistence, roomId, room => {
    const state = hydrateGameState(room.gameSnapshot, room.status);
    state.turnInfo = {};
    state.boardState.currentPlayer = { id: owner.playerId, hasMoved: false };
    state.boardState.ownedProps = {};
    for (const player of Object.values(state.players)) { player.accountBalance = 1500; player.currentTile = 0; player.isJail = false; }
    const powerUps = state.privateState.powerUps = createPowerUpState();
    powerUps.inventories[owner.playerId] = createPowerUpInventory(3);
    powerUps.inventories[other.playerId] = createPowerUpInventory(3);
    if (definition.activation === 'ACTIVE') {
      const scenario = activationCasesFor(owner.playerId, other.playerId).find(item => item.id === id)!;
      const prepared = scenario.prepare(state); request = prepared.request; instanceId = prepared.card.instanceId;
    } else {
      const defense = putCard(state, owner.playerId, id); instanceId = defense.instanceId;
      const continuation = { playerId: owner.playerId, turnNumber: state.boardState.turnNumber, resume: { kind: 'NO_TURN_CHANGE' as const } };
      if (id === 'D01' || id === 'D08') {
        state.boardState.ownedProps[1] = { id: other.playerId, color: 'blue', houses: 0 };
        openPowerUpRentReaction(state, createPowerUpRentEvent(state, owner.playerId, other.playerId, 1, 100, 6, 'DICE', continuation)!) ;
      } else if (id === 'D07') {
        state.players[owner.playerId].accountBalance = 50;
        state.boardState.ownedProps[1] = { id: owner.playerId, color: 'red', houses: 0 };
        enqueuePayments(state, [{ debtorPlayerId: owner.playerId, creditor: 'PLAYER', creditorPlayerId: other.playerId, amount: 150, source: { kind: 'OTHER', description: 'D07 boundary' } }], continuation);
        progressPaymentQueue(state);
      } else {
        state.boardState.currentPlayer = { id: other.playerId, hasMoved: false };
        const attackId = id === 'D09' ? 'A06' : id === 'D03' ? 'A03' : id === 'D06' ? 'A05' : 'A01';
        const attack = putCard(state, other.playerId, attackId);
        activatePowerUp(state, other.playerId, { instanceId: attack.instanceId, targetPlayerId: owner.playerId });
      }
      request = { eventId: powerUps.pendingReaction!.eventId, action: 'REACT', instanceId };
    }
    storeGameState(room.gameSnapshot, state, room.status);
  });
  await commitRoomCommand(server.runtime, roomId, () => {});
  const room = () => stored(server.runtime.persistence, roomId);
  const submit = (socket = owner.socket) => definition.activation === 'ACTIVE'
    ? ack(cb => socket.emit('activate power up', request as PowerUpActivationRequest, cb))
    : ack(cb => socket.emit('respond power up', request as PowerUpReactionRequest, cb));
  return { server, owner, other, roomId, room, submit, instanceId };
}

function assertEffect(id: string, state: Omit<GameState, 'loaded' | 'turnInfo'>, owner: string, other: string) {
  const pu = state.privateState.powerUps!;
  const statuses: Record<string, object> = {
    A02: { kind: 'RENT_MODIFIER', percent: 25, remainingUses: 1, remainingOwnerTurns: 2, targetTileID: 1 },
    A03: { kind: 'PURCHASE_SURCHARGE', percent: 20, capUnits: 50, remainingOwnerTurns: 2, targetPlayerId: other },
    A04: { kind: 'RENT_MODIFIER', percent: -25, remainingUses: 2, remainingOwnerTurns: 3, targetTileID: 1 },
    A05: { kind: 'BUILD_RESTRICTION', remainingOwnerTurns: 1, targetPlayerId: other },
    A07: { kind: 'RENT_SHARE', percent: 50, capUnits: 100, remainingOwnerTurns: 2 },
    A08: { kind: 'RENT_MODIFIER', percent: -50, affectedPlayerIds: [other], expiresAtStartPlayerId: owner },
    A10: { kind: 'RENT_SURCHARGE', percent: 50, capUnits: 100, remainingUses: 1 },
    D04: { kind: 'PROPERTY_SHIELD', remainingUses: 2, remainingOwnerTurns: 3, targetTileID: 1 },
    U03: { kind: 'PURCHASE_DISCOUNT', percent: 15, capUnits: 50, targetTileID: 1 },
    U09: { kind: 'BUILD_DISCOUNT', percent: 20, capUnits: 50, remainingUses: 1, remainingOwnerTurns: 2 },
  };
  if (statuses[id]) expect(pu.statuses).toMatchObject([{ definitionId: id, ...statuses[id] }]);
  switch (id) {
    case 'A01': expect([state.players[owner].accountBalance, state.players[other].accountBalance]).toEqual([1550, 1450]); break;
    case 'A06': expect(pu.inventories[owner].cards.map(c => c.definitionId)).toEqual(['U01']); expect(pu.inventories[other].cards).toEqual([]); break;
    case 'A09': expect(state.players[other].accountBalance).toBe(1490); break;
    case 'D01': expect([state.players[owner].accountBalance, state.players[other].accountBalance]).toEqual([1440, 1560]); break;
    case 'D08': expect([state.players[owner].accountBalance, state.players[other].accountBalance]).toEqual([1500, 1600]); break;
    case 'D07': expect([state.players[owner].accountBalance, state.players[other].accountBalance]).toEqual([0, 1650]); expect(state.boardState.paymentQueue).toBeNull(); break;
    case 'D05': expect([state.players[owner].accountBalance, state.players[other].accountBalance]).toEqual([1550, 1450]); break;
    case 'D02': case 'D03': case 'D06': case 'D09': expect(pu.statuses).toEqual([]); expect(state.players[owner].accountBalance).toBe(1500); break;
    case 'D10': expect(pu.statuses).toEqual([]); break;
    case 'U01': expect(state.boardState.diceValue).toEqual({ dice1: 2, dice2: 2 }); expect(state.players[owner].currentTile).toBe(4); break;
    case 'U02': expect(state.players[owner].currentTile).toBe(5); expect(state.boardState.diceValue).toEqual({ dice1: 1, dice2: 2 }); break;
    case 'U05': case 'U08': expect(state.players[owner].currentTile).toBe(1); expect(pu.pendingMovement).toBeNull(); break;
    case 'U04': expect(pu.inventories[owner].cards).toHaveLength(1); expect(OFFICIAL_POWER_UP_REGISTRY.get(pu.inventories[owner].cards[0].definitionId).rarity).toBe('RARE'); break;
    case 'U06': expect(pu.pendingTrade?.initiatorPlayerId).toBe(owner); break;
    case 'U07': expect(state.boardState.ownedProps[1].id).toBe(owner); expect(state.players[owner].accountBalance).toBe(1500 - Math.ceil(purchaseBasePrice(1) * 1.25)); expect(state.players[owner].currentTile).toBe(0); expect(pu.rewardQueue.offers).toEqual([]); break;
    case 'U10': { const output = pu.inventories[owner].cards; expect(output).toHaveLength(1); expect(output[0].definitionId).not.toBe('A02'); expect(OFFICIAL_POWER_UP_REGISTRY.get(output[0].definitionId)).toMatchObject({ rarity: 'COMMON', category: 'ATTACK' }); break; }
  }
}

describe('all 30 cards through authenticated serialized transactions', () => {
  it.each(OFFICIAL_POWER_UP_DEFINITIONS)('$definitionId effect, ownership, save rollback, replay and reconnect', async ({ definitionId }) => {
    const f = await fixture(definitionId);
    const before = await f.room();
    expect((await f.submit(f.other.socket)).ok).toBe(false);
    expect(await f.room()).toEqual(before);
    const invalid = OFFICIAL_POWER_UP_REGISTRY.get(definitionId).activation === 'ACTIVE'
      ? await ack(cb => f.owner.socket.emit('activate power up', { instanceId: f.instanceId, targetPlayerId: f.owner.playerId, movementDelta: 99 }, cb))
      : await ack(cb => f.owner.socket.emit('respond power up', { eventId: before.gameSnapshot.gameState.privateState.powerUps!.pendingReaction!.eventId, action: 'REACT', instanceId: randomUUID() }, cb));
    expect(invalid.ok).toBe(false); expect(await f.room()).toEqual(before);
    const persistence = f.server.runtime.persistence;
    const transaction = persistence.transaction.bind(persistence);
    const spy = vi.spyOn(persistence, 'transaction').mockImplementationOnce(callback => transaction(async tx => {
      const save = vi.spyOn(tx.rooms, 'save').mockRejectedValueOnce(new Error('08B injected save failure: ' + definitionId));
      try { return await callback(tx); } finally { save.mockRestore(); }
    }));
    try { expect((await f.submit()).ok).toBe(false); } finally { spy.mockRestore(); }
    expect(await f.room()).toEqual(before);
    const dice = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    try { okOf(await f.submit()); } finally { dice.mockRestore(); }
    let after = await f.room();
    assertEffect(definitionId, after.gameSnapshot.gameState, f.owner.playerId, f.other.playerId);
    expect((await f.submit()).ok).toBe(false);
    expect(await f.room()).toEqual(after);
    if (definitionId === 'U06') {
      const trade = after.gameSnapshot.gameState.privateState.powerUps!.pendingTrade!;
      okOf(await ack(cb => f.other.socket.emit('resolve power up trade', { requestId: trade.requestId, accept: true }, cb)));
      after = await f.room();
      expect(after.gameSnapshot.gameState.privateState.powerUps!.inventories[f.owner.playerId].cards.map(c => c.definitionId)).toEqual(['D01']);
      expect(after.gameSnapshot.gameState.privateState.powerUps!.inventories[f.other.playerId].cards.map(c => c.definitionId)).toEqual(['A01']);
    }
    expect(after.gameSnapshot.gameState.privateState.powerUps!.inventories[f.owner.playerId].cards.some(c => c.instanceId === f.instanceId)).toBe(false);
    const expected = projectPrivatePlayerState(after, f.owner.playerId).powerUps;
    f.owner.socket.disconnect();
    await vi.waitFor(() => expect(f.server.runtime.connections.isConnected(f.owner.playerId)).toBe(false));
    const reconnectedSocket = await connect(f.server.url);
    const reconnected = await resume(reconnectedSocket, f.owner.token);
    expect(reconnected.privatePlayerState.powerUps?.inventory).toEqual(expected?.inventory);
    expect(reconnected.privatePlayerState.powerUps?.statuses).toEqual(expected?.statuses);
    expect(JSON.stringify(projectPublicRoomState(await f.room(), f.server.runtime.connections))).not.toMatch(/definitionId|instanceId|rewardQueue|candidates|rentRevenueShare/);
    okOf(await ack<LeaveRoomResult>(cb => reconnectedSocket.emit('leave room', cb)));
    const eliminated = (await f.room()).gameSnapshot.gameState;
    expect(eliminated.privateState.powerUps!.inventories[f.owner.playerId]).toBeUndefined();
    expect(eliminated.privateState.powerUps!.pendingReaction).toBeFalsy();
    expect(eliminated.privateState.powerUps!.statuses).toEqual([]);
  });
});


describe('08B multiplayer races and deadline recovery', () => {
  it('React and Pass racing commit exactly one result',async()=>{const f=await fixture('D03');const event=(await f.room()).gameSnapshot.gameState.privateState.powerUps!.pendingReaction!;const results=await Promise.all([f.submit(),ack(cb=>f.owner.socket.emit('respond power up',{eventId:event.eventId,action:'PASS'},cb))]);expect(results.filter(r=>r.ok)).toHaveLength(1);const state=(await f.room()).gameSnapshot.gameState;expect(state.privateState.powerUps!.pendingReaction).toBeNull();expect(state.privateState.powerUps!.inventories[f.other.playerId].cards).toHaveLength(0);expect(state.privateState.powerUps!.statuses).toHaveLength(results[0].ok?0:1)});
  it('deadline minus one stays open, exact deadline expires once, and reconnect shows committed outcome',async()=>{const f=await fixture('D05');const initial=await f.room();const event=initial.gameSnapshot.gameState.privateState.powerUps!.pendingReaction!;f.owner.socket.disconnect();await vi.waitFor(()=>expect(f.server.runtime.connections.isConnected(f.owner.playerId)).toBe(false));await recoverRoomIfDue(f.server.io,f.server.runtime,f.roomId,new Date(Date.parse(event.deadlineAt)-1));expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.pendingReaction).toBeTruthy();await Promise.all([recoverRoomIfDue(f.server.io,f.server.runtime,f.roomId,new Date(event.deadlineAt)),recoverRoomIfDue(f.server.io,f.server.runtime,f.roomId,new Date(event.deadlineAt))]);const after=await f.room();expect(after.gameSnapshot.gameState.privateState.powerUps!.pendingReaction).toBeNull();expect(after.gameSnapshot.gameState.players[f.owner.playerId].accountBalance).toBe(1450);const restored=await resume(await connect(f.server.url),f.owner.token);expect(restored.privatePlayerState.powerUps?.reaction).toBeNull();expect(restored.privatePlayerState.powerUps?.inventory?.cards).toHaveLength(1);expect((await f.room()).gameSnapshot.gameState.players[f.owner.playerId].accountBalance).toBe(1450)});
  it('disconnect during target selection spends nothing and restores the owned card',async()=>{const f=await fixture('A01');const before=(await f.room()).gameSnapshot.gameState.privateState.powerUps!.inventories[f.owner.playerId];f.owner.socket.disconnect();await vi.waitFor(()=>expect(f.server.runtime.connections.isConnected(f.owner.playerId)).toBe(false));const restored=await resume(await connect(f.server.url),f.owner.token);expect(restored.privatePlayerState.powerUps?.inventory?.cards.map(c=>c.instanceId)).toEqual(before.cards.map(c=>c.instanceId));expect((await f.room()).gameSnapshot.gameState.players[f.owner.playerId].accountBalance).toBe(1500)});
  it('U06 survives target disconnect/reconnect and consent exchanges once',async()=>{const f=await fixture('U06');okOf(await f.submit());const trade=(await f.room()).gameSnapshot.gameState.privateState.powerUps!.pendingTrade!;f.other.socket.disconnect();await vi.waitFor(()=>expect(f.server.runtime.connections.isConnected(f.other.playerId)).toBe(false));const socket=await connect(f.server.url);const restored=await resume(socket,f.other.token);expect(restored.privatePlayerState.powerUps?.tradeRequest?.requestId).toBe(trade.requestId);const request={requestId:trade.requestId,accept:true};const results=await Promise.all([ack(cb=>socket.emit('resolve power up trade',request,cb)),ack(cb=>socket.emit('resolve power up trade',request,cb))]);expect(results.filter(r=>r.ok)).toHaveLength(1);expect((await f.room()).gameSnapshot.gameState.privateState.powerUps!.pendingTrade).toBeNull()});
});


describe('08B deadline rollback',()=>{
  it('a failed Reaction timeout transaction preserves the pending event and retries once',async()=>{
    const f=await fixture('D03');const before=await f.room();const event=before.gameSnapshot.gameState.privateState.powerUps!.pendingReaction!;const persistence=f.server.runtime.persistence;const transaction=persistence.transaction.bind(persistence);const spy=vi.spyOn(persistence,'transaction').mockImplementationOnce(callback=>transaction(async tx=>{const save=vi.spyOn(tx.rooms,'save').mockRejectedValueOnce(new Error('timeout save failed'));try{return await callback(tx)}finally{save.mockRestore()}}));
    try{await expect(recoverRoomIfDue(f.server.io,f.server.runtime,f.roomId,new Date(event.deadlineAt))).rejects.toThrow('timeout save failed')}finally{spy.mockRestore()}
    expect(await f.room()).toEqual(before);await recoverRoomIfDue(f.server.io,f.server.runtime,f.roomId,new Date(event.deadlineAt));const after=await f.room();expect(after.gameSnapshot.gameState.privateState.powerUps!.pendingReaction).toBeNull();expect(after.gameSnapshot.gameState.privateState.powerUps!.statuses).toMatchObject([{definitionId:'A03'}]);await recoverRoomIfDue(f.server.io,f.server.runtime,f.roomId,new Date(event.deadlineAt));expect(await f.room()).toEqual(after);
  });
});


describe('08B actual purchase and build combinations',()=>{
  it('A03 + U03 modifies one real purchase and preserves the coupon on cash rejection',async()=>{const f=await fixture('U03');await commitRoomCommand(f.server.runtime,f.roomId,({state})=>{state.privateState.powerUps!.statuses=[status('A03','PURCHASE_SURCHARGE',f.other.playerId,{targetPlayerId:f.owner.playerId,percent:20,capUnits:50})];state.players[f.owner.playerId].accountBalance=62});okOf(await f.submit());const before=await f.room();const operationId=before.gameSnapshot.gameState.turnInfo.pendingPropertyDecision!.operationId;expect((await ack(cb=>f.owner.socket.emit('buy property',{operationId},cb))).ok).toBe(false);expect(await f.room()).toEqual(before);await commitRoomCommand(f.server.runtime,f.roomId,({state})=>{state.players[f.owner.playerId].accountBalance=63});okOf(await ack(cb=>f.owner.socket.emit('buy property',{operationId},cb)));const state=(await f.room()).gameSnapshot.gameState;expect(state.players[f.owner.playerId].accountBalance).toBe(0);expect(state.boardState.ownedProps[1].id).toBe(f.owner.playerId);expect(state.privateState.powerUps!.statuses).toEqual([])});
  it('A05 + U09 cannot bypass a real build restriction and still permits skipping',async()=>{const f=await fixture('U09');okOf(await f.submit());await commitRoomCommand(f.server.runtime,f.roomId,({state})=>{state.privateState.powerUps!.statuses!.push(status('A05','BUILD_RESTRICTION',f.other.playerId,{targetPlayerId:f.owner.playerId,ownerTurnPlayerId:f.owner.playerId,remainingOwnerTurns:1}))});const before=await f.room();const operationId=before.gameSnapshot.gameState.turnInfo.pendingDevelopmentDecision!.operationId;expect((await ack(cb=>f.owner.socket.emit('resolve development',{operationId,action:'BUILD_HOUSES',quantity:1},cb))).ok).toBe(false);expect(await f.room()).toEqual(before);okOf(await ack(cb=>f.owner.socket.emit('resolve development',{operationId,action:'SKIP'},cb)));expect((await f.room()).gameSnapshot.gameState.boardState.ownedProps[1].houses).toBe(0)});
});


describe('08B per-Reaction timeout and unused-card preservation',()=>{
  it.each(OFFICIAL_POWER_UP_DEFINITIONS.filter(card=>card.activation==='REACTION'))('$definitionId expires once without consuming the unused defense (A06 can steal it)',async({definitionId})=>{const f=await fixture(definitionId);const before=await f.room();const event=before.gameSnapshot.gameState.privateState.powerUps!.pendingReaction!;await recoverRoomIfDue(f.server.io,f.server.runtime,f.roomId,new Date(event.deadlineAt));const after=await f.room();expect(after.gameSnapshot.gameState.privateState.powerUps!.pendingReaction).toBeNull();const remaining=after.gameSnapshot.gameState.privateState.powerUps!.inventories[definitionId==='D09'?f.other.playerId:f.owner.playerId].cards;expect(remaining.some(card=>card.instanceId===f.instanceId)).toBe(true);if(definitionId==='D09')expect(remaining.find(card=>card.instanceId===f.instanceId)?.ownerPlayerId).toBe(f.other.playerId);await recoverRoomIfDue(f.server.io,f.server.runtime,f.roomId,new Date(event.deadlineAt));expect(await f.room()).toEqual(after)});
});


describe('08B elimination during pending multiplayer interactions',()=>{
  it.each(['D03','U06'])('%s cancellation on player removal leaves a playable turn with three seats',async id=>{const f=await fixture(id,true);if(id==='U06')okOf(await f.submit());const departing=id==='D03'?f.owner:f.other;const continuing=id==='D03'?f.other:f.owner;okOf(await ack<LeaveRoomResult>(cb=>departing.socket.emit('leave room',cb)));const before=await f.room();expect(before.gameSnapshot.gameState.privateState.powerUps!.pendingReaction).toBeNull();expect(before.gameSnapshot.gameState.privateState.powerUps!.pendingTrade).toBeNull();const dice=vi.spyOn(Math,'random').mockReturnValue(.3);try{okOf(await ack(cb=>continuing.socket.emit('roll dice',cb)))}finally{dice.mockRestore()}expect((await f.room()).gameSnapshot.gameState.boardState.rollSequence).toBe(before.gameSnapshot.gameState.boardState.rollSequence+1)});
});
