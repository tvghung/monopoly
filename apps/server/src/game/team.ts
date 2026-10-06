import {
  buildAlternatingTurnOrder,
  formatMoney,
  getPlayerTeamId,
  getTeammateIds,
  isTeamMode,
  REVIVE_COST,
  REVIVE_STARTING_CASH,
  REVIVE_WINDOW_SURVIVOR_TURNS,
  teamActivePlayerIds,
  type GameState,
  type PlayerId,
  type ReviveWindow,
  type TeamId,
} from '@monopoly/shared';
import { activityPlayerName, recordActivityEvent } from './activity';
import { recordPublicGameplayEvent } from './semanticEvents';
import { sendToLog } from './text';

const START_TILE = 0;

/**
 * Seats the four players of a 2v2 match in their stable alternating slots (A1, B1, A2, B2) starting with `starterId` and makes
 * that order the live turn order. `membersByTeam` lists each team in join order. The slot order is kept for the whole match so
 * a revived player returns to the slot they left.
 */
export const startTeamMatch = (
  state: GameState,
  starterId: PlayerId,
  membersByTeam: Readonly<Record<TeamId, readonly PlayerId[]>>,
): PlayerId[] => {
  const slotOrder = buildAlternatingTurnOrder(starterId, membersByTeam);
  state.boardState.teamPlay = { slotOrder: [...slotOrder], revivedPlayerIds: [], reviveWindows: [] };
  state.boardState.players = [...slotOrder];
  return slotOrder;
};

/** The one player of the team who is still in the game, or `null` when the team has none (or more than one). */
export const survivorOfTeam = (state: GameState, teamId: TeamId): PlayerId | null => {
  const active = teamActivePlayerIds(state, teamId);
  return active.length === 1 ? active[0] : null;
};

export const reviveWindowOf = (state: GameState, playerId: PlayerId): ReviveWindow | undefined => (
  state.boardState.teamPlay.reviveWindows.find(reviveWindow => reviveWindow.playerId === playerId)
);

/**
 * Called right after a player was removed from the game by bankruptcy. In 2v2 the bankruptcy leaves the eliminated player
 * revivable for `REVIVE_WINDOW_SURVIVOR_TURNS` turns of their surviving teammate, unless they were already revived once or
 * the team has nobody left (the game ends instead). A voluntary leave never opens a window.
 */
export const openReviveWindowIfEligible = (state: GameState, eliminatedId: PlayerId): boolean => {
  const finished = state.boardState.finishedPlayers[eliminatedId];
  if (!isTeamMode(state) || !finished || finished.reason !== 'BANKRUPT' || state.boardState.winner) return false;
  const { teamPlay } = state.boardState;
  if (teamPlay.revivedPlayerIds.includes(eliminatedId) || reviveWindowOf(state, eliminatedId)) return false;
  const survivorId = survivorOfTeam(state, finished.teamId);
  if (!survivorId) return false;

  teamPlay.reviveWindows.push({
    playerId: eliminatedId,
    teamId: finished.teamId,
    turnsRemaining: REVIVE_WINDOW_SURVIVOR_TURNS,
    openedAtTurnNumber: state.boardState.turnNumber,
  });
  recordActivityEvent(state, {
    type: 'TEAM_REVIVE',
    action: 'WINDOW_OPENED',
    playerId: eliminatedId,
    playerName: finished.name,
    survivorPlayerId: survivorId,
    survivorName: activityPlayerName(state, survivorId),
    turnsRemaining: REVIVE_WINDOW_SURVIVOR_TURNS,
  });
  sendToLog(
    state,
    `${activityPlayerName(state, survivorId)} có ${REVIVE_WINDOW_SURVIVOR_TURNS} lượt để hồi sinh ${finished.name}.`,
  );
  return true;
};

/** Forgets a revive window without reviving: the player left the room, or the game ended. */
export const closeReviveWindow = (state: GameState, playerId: PlayerId): boolean => {
  const reviveWindows = state.boardState.teamPlay.reviveWindows;
  const index = reviveWindows.findIndex(reviveWindow => reviveWindow.playerId === playerId);
  if (index < 0) return false;
  reviveWindows.splice(index, 1);
  return true;
};

export const closeAllReviveWindows = (state: GameState): void => {
  state.boardState.teamPlay.reviveWindows = [];
};

/**
 * One turn of `endedTurnPlayerId` has just ended (completed, a jail wait, or skipped because they were disconnected: every
 * handoff goes through `nextTurn`). If that player is the survivor of an open revive window and the turn began after the window
 * opened, one opportunity is used; when none is left the elimination becomes permanent.
 */
export const consumeReviveTurn = (state: GameState, endedTurnPlayerId: PlayerId): void => {
  if (!isTeamMode(state) || !state.players[endedTurnPlayerId]) return;
  const teamId = getPlayerTeamId(state, endedTurnPlayerId);
  if (teamId === null) return;
  const reviveWindows = state.boardState.teamPlay.reviveWindows;
  for (const reviveWindow of [...reviveWindows]) {
    if (reviveWindow.teamId !== teamId || state.boardState.turnNumber <= reviveWindow.openedAtTurnNumber) continue;
    reviveWindow.turnsRemaining -= 1;
    if (reviveWindow.turnsRemaining > 0) continue;
    reviveWindows.splice(reviveWindows.indexOf(reviveWindow), 1);
    const name = state.boardState.finishedPlayers[reviveWindow.playerId]?.name ?? 'Người chơi';
    recordActivityEvent(state, {
      type: 'TEAM_REVIVE',
      action: 'EXPIRED',
      playerId: reviveWindow.playerId,
      playerName: name,
      survivorPlayerId: endedTurnPlayerId,
      survivorName: activityPlayerName(state, endedTurnPlayerId),
      turnsRemaining: 0,
    });
    sendToLog(state, `${name} đã bị loại vĩnh viễn: hết thời gian hồi sinh.`);
  }
};

export type ReviveEligibility =
  | { ok: true; reviveWindow: ReviveWindow; teammateId: PlayerId }
  | { ok: false; reason: string };

const refuse = (reason: string): ReviveEligibility => ({ ok: false, reason });

/**
 * Whether `actorId` may revive their teammate right now. A revive happens only in the survivor's own turn, from the moment
 * the turn opens until their landing resolves (before the roll, or while a purchase or development choice is waiting), and
 * never while a payment, a card or a rescue is in progress. Every number comes from the server's own state.
 */
export const getReviveEligibility = (state: GameState, actorId: PlayerId): ReviveEligibility => {
  if (state.boardState.winner) return refuse('Ván chơi đã kết thúc.');
  if (!isTeamMode(state)) return refuse('Chỉ có thể hồi sinh đồng đội trong chế độ 2v2.');
  const actor = state.players[actorId];
  if (!actor) return refuse('Chỉ người chơi còn trong ván mới có thể hồi sinh đồng đội.');
  if (state.boardState.currentPlayer.id !== actorId) {
    return refuse('Chỉ có thể hồi sinh đồng đội trong lượt của bạn.');
  }
  const reviveWindow = state.boardState.teamPlay.reviveWindows.find(candidate => candidate.teamId === actor.teamId);
  const teammateId = reviveWindow?.playerId;
  if (!reviveWindow || !teammateId || !state.boardState.finishedPlayers[teammateId]) {
    return refuse('Không có đồng đội nào có thể hồi sinh.');
  }
  if (!getTeammateIds(state, actorId).includes(teammateId)) return refuse('Người này không phải đồng đội của bạn.');
  if (state.boardState.turnNumber <= reviveWindow.openedAtTurnNumber) {
    return refuse('Cơ hội hồi sinh bắt đầu từ lượt kế tiếp của bạn.');
  }
  if (state.boardState.teamPlay.revivedPlayerIds.includes(teammateId)) {
    return refuse('Người này đã được hồi sinh một lần.');
  }
  const turn = state.turnInfo;
  const turnIsOpen = !state.boardState.currentPlayer.hasMoved
    || Boolean(turn.pendingPropertyDecision || turn.pendingDevelopmentDecision);
  if (state.boardState.paymentQueue || turn.pendingCardInteraction || !turnIsOpen) {
    return refuse('Không thể hồi sinh đồng đội vào lúc này.');
  }
  if (actor.accountBalance < REVIVE_COST) {
    return refuse(`Bạn cần ${formatMoney(REVIVE_COST)} để hồi sinh đồng đội.`);
  }
  return { ok: true, reviveWindow, teammateId };
};

/**
 * The live turn order is always the stable slot order restricted to the players still in the game. Removals only filter it, so
 * a revive just puts the returning player back at the slot they left: the current player and the order of everyone else are
 * untouched, which is why the revived player gets no turn until the order naturally reaches them.
 */
export const restoreTurnOrder = (state: GameState): void => {
  state.boardState.players = state.boardState.teamPlay.slotOrder.filter(playerId => Boolean(state.players[playerId]));
};

export type ReviveResult =
  | { ok: true; revivedPlayerId: PlayerId }
  | { ok: false; reason: string };

/**
 * The survivor pays `REVIVE_COST` to the Bank and their bankrupt teammate returns with `REVIVE_STARTING_CASH`, no property,
 * no cards, out of jail, standing on Xuất Phát, in their original turn slot. Nothing is restored from before the bankruptcy and
 * the revived player gets no turn of their own until the order reaches their slot.
 */
export const reviveTeammate = (state: GameState, actorId: PlayerId): ReviveResult => {
  const eligibility = getReviveEligibility(state, actorId);
  if (!eligibility.ok) return eligibility;
  const { teammateId } = eligibility;
  const actor = state.players[actorId];
  const finished = state.boardState.finishedPlayers[teammateId];
  const { teamPlay } = state.boardState;
  // Seats only matter in the lobby; the revived player simply takes the seat their survivor does not hold.
  const teamSlot = actor.teamSlot === 0 ? 1 : 0;

  actor.accountBalance -= REVIVE_COST;
  recordPublicGameplayEvent(state, {
    type: 'MONEY_TRANSFER',
    source: { kind: 'PLAYER', playerId: actorId },
    destination: { kind: 'BANK' },
    amount: REVIVE_COST,
    reason: 'REVIVE',
  });

  state.players[teammateId] = {
    name: finished.name,
    currentTile: START_TILE,
    color: finished.color,
    characterId: finished.characterId,
    teamId: finished.teamId,
    teamSlot,
    accountBalance: REVIVE_STARTING_CASH,
    isJail: false,
    jailOpponentRoundsElapsed: 0,
    heldJailFreeCardIds: [],
  };
  delete state.boardState.finishedPlayers[teammateId];
  recordPublicGameplayEvent(state, {
    type: 'MONEY_TRANSFER',
    source: { kind: 'BANK' },
    destination: { kind: 'PLAYER', playerId: teammateId },
    amount: REVIVE_STARTING_CASH,
    reason: 'REVIVE',
  });

  const reviveWindow = eligibility.reviveWindow;
  teamPlay.revivedPlayerIds.push(teammateId);
  closeReviveWindow(state, teammateId);
  restoreTurnOrder(state);

  recordActivityEvent(state, {
    type: 'TEAM_REVIVE',
    action: 'REVIVED',
    playerId: teammateId,
    playerName: finished.name,
    survivorPlayerId: actorId,
    survivorName: actor.name,
    turnsRemaining: reviveWindow.turnsRemaining,
  });
  sendToLog(
    state,
    `${actor.name} đã trả ${formatMoney(REVIVE_COST)} để hồi sinh ${finished.name}. `
    + `${finished.name} trở lại Xuất Phát với ${formatMoney(REVIVE_STARTING_CASH)}.`,
  );
  return { ok: true, revivedPlayerId: teammateId };
};
