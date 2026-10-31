/** Run after the client build: node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpAcceptance.check.mjs
 * Local browser acceptance only. Fixture positioning stays inside this process; no debug endpoint is installed.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from '../apps/server/src/createServer.ts';
import { loadServerConfig } from '../apps/server/src/config.ts';
import { InMemoryPersistenceStore } from '../apps/server/src/persistence/inMemory.ts';
import { createAppRuntime } from '../apps/server/src/services/runtime.ts';
import { registerSocketHandlers } from '../apps/server/src/socket/index.ts';
import { commitRoomCommand } from '../apps/server/src/socket/roomCommands.ts';
import { broadcastRoom } from '../apps/server/src/socket/broadcast.ts';
import { recoverRoomIfDue } from '../apps/server/src/services/deadlineScheduler.ts';
import { runGameCommand, rollDiceCommand } from '../apps/server/src/commands/gameplay.ts';
import { completePowerUpOwnerTurn } from '../apps/server/src/game/powerUps/lifecycle.ts';
import { tileState } from '../packages/shared/src/index.ts';
import { DEFAULT_GAME_SETTINGS, SETTINGS_STORAGE_KEY } from '../apps/client/src/settings/defaults.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.env.POWERUP_ACCEPTANCE_OUT || path.join(root, 'test-results/powerup-acceptance'));
await mkdir(output, { recursive: true });
const persistence = new InMemoryPersistenceStore();
const runtime = createAppRuntime(persistence, loadServerConfig({}).persistenceTiming);
const { server, io } = createServer(runtime, { environment: { SERVER_RUNTIME_PROFILE: 'desktop' }, clientDist: path.join(root, 'apps/client/dist') });
registerSocketHandlers(io, runtime, 'development');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.POWERUP_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-webgl'] });
const contexts = [];
const evidence = { status: 'RUNNING', origin, steps: [], screenshots: [], errors: [], recoveryClock: 'scheduler invoked at stored absolute deadline + 1ms', renderer: 'Chromium production client, supported legacy board fallback' };
const grantFixtureCard = (state, ownerPlayerId, definitionId) => {
  const powerUps = state.privateState.powerUps;
  const inventory = powerUps.inventories[ownerPlayerId] ??= { capacity: 3, cards: [] };
  inventory.cards.push({ instanceId: randomUUID(), ownerPlayerId, obtainedFromOfferId: randomUUID(), definitionId });
};
const step = async name => { evidence.steps.push(name); console.log('PASS: ' + name); await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); };
async function context(viewport = { width: 1440, height: 900 }) {
  const result = await browser.newContext({ viewport, reducedMotion: 'reduce' }); contexts.push(result);
  await result.addInitScript(({ key, defaults }) => {
    if (globalThis.location.origin !== 'null') localStorage.setItem(key, JSON.stringify({ ...defaults, muted: true, reducedMotion: true, graphicsQuality: 'low' }));
  }, { key: SETTINGS_STORAGE_KEY, defaults: DEFAULT_GAME_SETTINGS });
  result.on('page', page => page.on('pageerror', error => evidence.errors.push(error.message)));
  return result;
}
async function screenshot(page, name) { await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' }); evidence.screenshots.push(name); }
async function poll(read, valid, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await read(); if (valid(value)) return value; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('Acceptance state did not arrive before timeout');
}
try {
  const ownerContext = await context(); let owner = await ownerContext.newPage();
  const guestContext = await context(); const guest = await guestContext.newPage();
  for (const [page, name] of [[owner, 'Reward Host'], [guest, 'Reward Guest']]) {
    await page.goto(origin + '/?room=PU-ACCEPT'); await page.getByLabel('Tên của bạn').fill(name);
    await page.getByRole('button', { name: 'Vào phòng' }).click(); await expect(page.getByRole('heading', { name: 'PU-ACCEPT' })).toBeVisible();
  }
  await owner.getByRole('button', { name: 'Chó', exact: true }).click(); await guest.getByRole('button', { name: 'Capybara', exact: true }).click();
  await owner.getByRole('button', { name: /^Thêm Bot/ }).first().click();
  await owner.getByRole('button', { name: 'Sẵn sàng', exact: true }).click(); await guest.getByRole('button', { name: 'Sẵn sàng', exact: true }).click();
  await owner.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await expect(owner.getByTestId('game-board')).toBeVisible(); await expect(guest.getByTestId('game-board')).toBeVisible();
  await expect(owner.locator('.legacy-board')).toBeVisible();
  let room = await persistence.rooms.findByCode('PU-ACCEPT'); const roomId = room.id;
  const ownerId = Object.entries(room.gameSnapshot.gameState.players).find(([,p]) => p.name === 'Reward Host')[0];
  const guestId = Object.entries(room.gameSnapshot.gameState.players).find(([,p]) => p.name === 'Reward Guest')[0];
  const botId = Object.entries(room.gameSnapshot.members).find(([,member]) => member.kind === 'BOT')[0];
  const load = () => persistence.rooms.findById(roomId);
  const latestOffer = async () => (await load()).gameSnapshot.gameState.privateState.powerUps.rewardQueue.offers.at(-1);
  const inventory = async () => (await load()).gameSnapshot.gameState.privateState.powerUps.inventories[ownerId].cards;
  await step('Two real browser clients joined, selected mascots, readied and started multiplayer');
  const prepareRoll = async () => {
    const prepared = await commitRoomCommand(runtime, roomId, ({state}) => {
      state.boardState.currentPlayer = { id: ownerId, hasMoved: false }; state.boardState.turnNumber += 1; state.boardState.turnRecovery = null;
      state.players[ownerId].currentTile = 38; state.turnInfo = {};
    }); broadcastRoom(io, runtime, prepared.room);
    await expect(owner.getByRole('button', { name: 'Đổ xúc xắc', exact: true })).toBeVisible();
    const before = prepared.room.gameSnapshot.gameState.players[ownerId].accountBalance;
    const beforeCount = prepared.room.gameSnapshot.gameState.privateState.powerUps?.rewardQueue.offers.length ?? 0;
    const random = Math.random; Math.random = () => 0;
    try { await owner.getByRole('button', { name: 'Đổ xúc xắc', exact: true }).click();
      try {
        await poll(load, r => {
          const game = r.gameSnapshot.gameState;
          return (game.privateState.powerUps?.rewardQueue.offers.length ?? 0) === beforeCount + 1
            || game.privateState.powerUps?.pendingMovement?.playerId === ownerId;
        });
        let after = await load();
        if (after.gameSnapshot.gameState.privateState.powerUps?.pendingMovement?.playerId === ownerId) {
          const continueMovement = owner.getByRole('button', { name: /^Tiếp tục với \d+ bước$/ });
          await expect(continueMovement).toBeVisible();
          await continueMovement.click();
          await poll(load, r => (r.gameSnapshot.gameState.privateState.powerUps?.rewardQueue.offers.length ?? 0) === beforeCount + 1);
        }
      }
      catch {
        const after = await load(); const game = after.gameSnapshot.gameState;
        throw new Error(`START offer timeout: expected ${beforeCount + 1}, got ${game.privateState.powerUps?.rewardQueue.offers.length ?? 0}; current=${game.boardState.currentPlayer.id}; owner=${ownerId}; turn=${game.boardState.turnNumber}; winner=${game.boardState.winner ?? 'none'}; pending=${JSON.stringify({ landing: game.turnInfo.pendingLandingDecision, payment: Boolean(game.boardState.paymentQueue), movement: game.privateState.powerUps?.pendingMovement })}`);
      }
    } finally { Math.random = random; }
    const awarded = await load(); assert.equal(awarded.gameSnapshot.gameState.players[ownerId].accountBalance, before + 200);
    await expect(owner.getByRole('dialog', { name: 'Quà Xuất Phát' })).toBeVisible();
    const rewardDialog = owner.getByRole('dialog', { name: 'Quà Xuất Phát' });
    assert.equal(await rewardDialog.locator('.power-up-card--back').count(), 3);
    assert.equal(await rewardDialog.locator('.power-up-card__rarity').count(), 0);
    return latestOffer();
  };
  const first = await prepareRoll(); const candidates = structuredClone(first.candidates); await screenshot(owner, '01-selection-desktop.png');
  await owner.reload(); await expect(owner.getByRole('dialog', { name: 'Quà Xuất Phát' })).toBeVisible(); assert.deepEqual((await latestOffer()).candidates, candidates);
  await step('Real dice START awarded exactly 200 and exactly one hidden offer; reload restored the same choices');
  await owner.getByRole('button', { name: 'Phòng thủ', exact: true }).click(); await expect(owner.locator('.power-up-card--revealed')).toHaveCount(3);
  assert.equal((await latestOffer()).selectedIndex, 1); assert.equal(await owner.locator('.power-up-card--selected').count(), 1);
  await screenshot(owner, '02-reveal-desktop.png');
  await owner.close(); owner = await ownerContext.newPage(); await owner.goto(origin);
  await expect(owner.locator('.power-up-card--revealed')).toHaveCount(3); assert.equal(await owner.locator('.power-up-card--back').count(), 0);
  await owner.getByRole('button', { name: 'Nhận thẻ', exact: true }).click(); await poll(inventory, cards => cards.length === 1);
  await expect(owner.getByRole('dialog', { name: 'Quà Xuất Phát' })).toBeHidden(); assert.equal((await load()).gameSnapshot.gameState.boardState.currentPlayer.id, guestId);
  const inventoryBox = await owner.locator('.power-up-dock').boundingBox(); assert.ok(inventoryBox);
  for (const control of await owner.locator('.camera-controls, .game-board__property-access').all()) {
    const box = await control.boundingBox(); assert.ok(box);
    assert.ok(!(inventoryBox.x < box.x + box.width && inventoryBox.x + inventoryBox.width > box.x && inventoryBox.y < box.y + box.height && inventoryBox.y + inventoryBox.height > box.y), 'Inventory and existing dock controls overlap');
  }
  await screenshot(owner,'05-hud-desktop.png');
  await step('All three cards revealed, selected card stayed locked across reconnect, one card claimed and turn continued');
  for (let i = 1; i < 3; i++) { await prepareRoll(); await owner.getByRole('button', { name: 'Tấn công', exact: true }).click(); await owner.getByRole('button', { name: 'Nhận thẻ', exact: true }).click(); await poll(inventory, cards => cards.length === i + 1); }
  const held = structuredClone(await inventory()); await owner.setViewportSize({ width: 900, height: 500 });
  await prepareRoll(); await owner.getByRole('button', { name: 'Tiện ích', exact: true }).click();
  await expect(owner.getByText(/Kho thẻ đã đầy/)).toBeVisible(); assert.equal(await owner.getByRole('button', { name: 'Nhận thẻ', exact: true }).count(), 0);
  const fullInventoryBody = owner.locator('.power-up-reward .ds-modal__body');
  const scrollState = await fullInventoryBody.evaluate(element => ({
    clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
    overflowY: element.ownerDocument.defaultView?.getComputedStyle(element).overflowY,
  }));
  assert.equal(scrollState.overflowY, 'auto');
  assert.ok(scrollState.scrollHeight > scrollState.clientHeight, 'Full inventory replacement content remains reachable by scrolling');
  await screenshot(owner, '03-full-inventory-landscape.png');
  const replaceButton = owner.getByRole('button', { name: /Thay thẻ này/ }).first();
  await replaceButton.scrollIntoViewIfNeeded(); await screenshot(owner, '03b-full-inventory-landscape-scrolled.png');
  await replaceButton.click();
  await poll(inventory, cards => cards.length === 3 && !cards.some(card => card.instanceId === held[0].instanceId));
  await step('Capacity three enforced and an explicitly chosen held instance replaced in a landscape viewport');
  const kept = structuredClone(await inventory()); await prepareRoll(); await owner.getByRole('button', { name: 'Tấn công', exact: true }).click();
  await owner.getByRole('button', { name: 'Bỏ thẻ mới', exact: true }).click(); await expect(owner.getByRole('dialog', { name: 'Quà Xuất Phát' })).toBeHidden(); assert.deepEqual(await inventory(), kept);
  await owner.getByRole('button', { name: /Kho Power-up/ }).click(); await expect(owner.getByRole('dialog', { name: 'Kho Power-up' })).toContainText('Dùng thẻ'); await screenshot(owner, '04-inventory-landscape.png');
  await owner.getByRole('dialog', { name: 'Kho Power-up' }).getByRole('button', { name: 'Đóng', exact: true }).click();
  await step('Declining preserved existing cards; inventory showed real card actions and registry details');
  await prepareRoll(); await owner.close();
  room = await poll(load, r => Boolean(r.gameSnapshot.gameState.boardState.turnRecovery)); const deadline = room.gameSnapshot.gameState.boardState.turnRecovery.deadlineAt;
  await recoverRoomIfDue(io, runtime, roomId, new Date(Date.parse(deadline) + 1));
  assert.equal((await latestOffer()).outcome.kind, 'DISCARDED_FULL'); assert.deepEqual(await inventory(), kept);
  owner = await ownerContext.newPage(); await owner.goto(origin); await expect(owner.getByTestId('game-board')).toBeVisible();
  await expect(owner.getByRole('dialog', { name: 'Quà Xuất Phát' })).toBeHidden(); await step('Offline deadline recovery discarded only the new card and reconnect did not offer another claim');
  // A bot fixture uses the same room commit/claim path without adding a client-only privilege or HTTP endpoint.
  const botSetup = await commitRoomCommand(runtime, roomId, ({state}) => {
    state.boardState.currentPlayer = {id:botId,hasMoved:false}; state.boardState.turnNumber += 1;
    state.players[botId].currentTile = 38; state.turnInfo = {};
  });
  broadcastRoom(io,runtime,botSetup.room);
  const random = Math.random;Math.random=()=>0;
  try { await runGameCommand(io,runtime,rollDiceCommand,roomId,botId,undefined); } finally { Math.random=random; }
  room=await load();assert.equal(room.gameSnapshot.gameState.privateState.powerUps.inventories[botId].cards.length,1);
  assert.equal(room.gameSnapshot.gameState.privateState.powerUps.rewardQueue.offers.at(-1).stage,'COMPLETED');
  await step('Bot START reward resolved through the shared authoritative grant path without blocking');

  // Seed a representative attack and defense pair inside an authoritative room transaction.
  const attackSetup = await commitRoomCommand(runtime, roomId, ({ state }) => {
    const powerUps = state.privateState.powerUps;
    powerUps.inventories[ownerId] = { capacity: 3, cards: [] };
    powerUps.inventories[guestId] = { capacity: 3, cards: [] };
    powerUps.statuses = []; powerUps.pendingReaction = null; powerUps.pendingTrade = null; powerUps.pendingMovement = null;
    state.turnInfo = {};
    state.boardState.turnNumber += 1; state.boardState.currentPlayer = { id: ownerId, hasMoved: false };
    state.players[ownerId].accountBalance = 1_000; state.players[guestId].accountBalance = 1_000;
    grantFixtureCard(state, ownerId, 'A01'); grantFixtureCard(state, guestId, 'D05');
  });
  broadcastRoom(io, runtime, attackSetup.room);
  await expect(owner.getByTestId('game-board')).toBeVisible();
  await owner.getByRole('button', { name: /Kho Power-up/ }).click();
  await owner.getByRole('dialog', { name: 'Kho Power-up' }).getByRole('button', { name: 'Dùng thẻ', exact: true }).click();
  await owner.getByRole('dialog', { name: 'Móc Túi' }).getByLabel('Chọn người chơi').selectOption({ label: 'Reward Guest' });
  await owner.getByRole('dialog', { name: 'Móc Túi' }).getByRole('button', { name: 'Dùng thẻ', exact: true }).click();
  await expect(guest.locator('.power-up-reaction')).toBeVisible();
  await guest.reload(); await expect(guest.locator('.power-up-reaction')).toBeVisible();
  await expect(guest.getByRole('timer')).toBeVisible(); await screenshot(guest, '06-reaction-reconnect.png');
  await guest.locator('.power-up-reaction').getByRole('button', { name: 'Dùng thẻ', exact: true }).click();
  await poll(load, current => current.gameSnapshot.gameState.privateState.powerUps.pendingReaction === null
    && current.gameSnapshot.gameState.privateState.powerUps.inventories[ownerId].cards.length === 0
    && current.gameSnapshot.gameState.privateState.powerUps.inventories[guestId].cards.length === 0);
  room = await load();
  assert.equal(room.gameSnapshot.gameState.players[ownerId].accountBalance, 950);
  assert.equal(room.gameSnapshot.gameState.players[guestId].accountBalance, 1_050);
  await step('A01 activated through the real client; D05 prompt survived reconnect, reflected the theft, and consumed both cards');

  // Remote investment pays 125% to the bank, takes no movement, and never opens a landing interaction.
  const remoteTileID = Object.keys(tileState).map(Number).find(id => tileState[id]?.price && ![0, 10, 20, 30].includes(id));
  assert.notEqual(remoteTileID, undefined);
  const remoteSetup = await commitRoomCommand(runtime, roomId, ({ state }) => {
    const powerUps = state.privateState.powerUps;
    powerUps.inventories[ownerId] = { capacity: 3, cards: [] };
    powerUps.inventories[guestId] = { capacity: 3, cards: [] };
    powerUps.statuses = []; powerUps.pendingReaction = null; powerUps.pendingTrade = null; powerUps.pendingMovement = null;
    state.turnInfo = {};
    delete state.boardState.ownedProps[remoteTileID];
    state.boardState.turnNumber += 1; state.boardState.currentPlayer = { id: ownerId, hasMoved: false };
    state.players[ownerId].currentTile = 0; state.players[ownerId].accountBalance = 2_000;
    grantFixtureCard(state, ownerId, 'U07');
  });
  broadcastRoom(io, runtime, remoteSetup.room);
  await owner.setViewportSize({ width: 1280, height: 720 });
  await owner.getByRole('button', { name: /Kho Power-up/ }).click();
  await owner.getByRole('dialog', { name: 'Kho Power-up' }).getByRole('button', { name: 'Dùng thẻ', exact: true }).click();
  await owner.getByRole('dialog', { name: 'Đầu Tư Từ Xa' }).getByLabel('Chọn tài sản').selectOption(String(remoteTileID));
  await screenshot(owner, '07-remote-purchase-1280x720.png');
  await owner.getByRole('dialog', { name: 'Đầu Tư Từ Xa' }).getByRole('button', { name: 'Dùng thẻ', exact: true }).click();
  await poll(load, current => current.gameSnapshot.gameState.boardState.ownedProps[remoteTileID]?.id === ownerId);
  room = await load();
  assert.equal(room.gameSnapshot.gameState.players[ownerId].accountBalance,
    2_000 - Math.ceil(tileState[remoteTileID].price * 125 / 100));
  assert.equal(room.gameSnapshot.gameState.players[ownerId].currentTile, 0);
  assert.equal(room.gameSnapshot.gameState.turnInfo.pendingLandingDecision, undefined);
  assert.equal(room.gameSnapshot.gameState.privateState.powerUps.inventories[ownerId].cards.length, 0);
  await step('U07 remote purchase completed at 125% through the real client without moving or resolving the destination tile');

  // Persisted status duration advances through the same owner-turn lifecycle hook used by turn completion.
  const statusSetup = await commitRoomCommand(runtime, roomId, ({ state }) => {
    const powerUps = state.privateState.powerUps;
    powerUps.inventories[ownerId] = { capacity: 3, cards: [] };
    powerUps.statuses = []; powerUps.pendingReaction = null;
    state.turnInfo = {}; state.boardState.turnNumber += 1;
    state.boardState.currentPlayer = { id: ownerId, hasMoved: false };
    const ownedTile = Object.entries(state.boardState.ownedProps).find(([, property]) => property.id === ownerId)?.[0];
    if (ownedTile === undefined) state.boardState.ownedProps[2] = { id: ownerId, color: 'red', houses: 0 };
    grantFixtureCard(state, ownerId, 'A02');
  });
  broadcastRoom(io, runtime, statusSetup.room);
  await owner.getByRole('button', { name: /Kho Power-up/ }).click();
  await owner.getByRole('dialog', { name: 'Kho Power-up' }).getByRole('button', { name: 'Dùng thẻ', exact: true }).click();
  const ownedPropertyID = Object.entries(statusSetup.room.gameSnapshot.gameState.boardState.ownedProps)
    .find(([, property]) => property.id === ownerId)?.[0] ?? '2';
  await owner.getByRole('dialog', { name: 'Tăng Phí Đột Xuất' }).getByLabel('Chọn tài sản').selectOption(ownedPropertyID);
  await owner.getByRole('dialog', { name: 'Tăng Phí Đột Xuất' }).getByRole('button', { name: 'Dùng thẻ', exact: true }).click();
  await poll(load, current => current.gameSnapshot.gameState.privateState.powerUps.statuses.some(status => status.definitionId === 'A02'));
  await owner.getByRole('button', { name: /Kho Power-up/ }).click();
  await expect(owner.getByRole('dialog', { name: 'Kho Power-up' })).toContainText('Tăng Phí Đột Xuất');
  await owner.getByRole('dialog', { name: 'Kho Power-up' }).getByRole('button', { name: 'Đóng', exact: true }).click();
  const expire = await commitRoomCommand(runtime, roomId, ({ state }) => {
    completePowerUpOwnerTurn(state, ownerId);
    state.boardState.turnNumber += 1; state.boardState.currentPlayer = { id: guestId, hasMoved: false };
  });
  broadcastRoom(io, runtime, expire.room);
  const secondExpire = await commitRoomCommand(runtime, roomId, ({ state }) => {
    completePowerUpOwnerTurn(state, ownerId);
    state.boardState.turnNumber += 1; state.boardState.currentPlayer = { id: ownerId, hasMoved: false };
  });
  broadcastRoom(io, runtime, secondExpire.room);
  await poll(load, current => !current.gameSnapshot.gameState.privateState.powerUps.statuses.some(status => status.definitionId === 'A02'));
  await step('A02 persisted status appeared in the real inventory and expired after its two authoritative owner-turn completions');
  assert.deepEqual(evidence.errors, []); evidence.status='PASS'; console.log('Power-up browser acceptance PASS: '+evidence.steps.length+' scenarios');
} catch(error) {
  evidence.status='FAIL';evidence.failure=String(error.stack ?? error);
  for(const ctx of contexts)for(const page of ctx.pages())await screenshot(page,'failure-'+evidence.screenshots.length+'.png').catch(()=>{});
  throw error;
} finally {
  await writeFile(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));
  runtime.flags.shuttingDown=true;await browser.close();await io.close();await persistence.close();
}
