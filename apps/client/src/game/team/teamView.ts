import {
  colorGroups,
  getPlayerTeamId,
  isTeamMode,
  REVIVE_COST,
  REVIVE_STARTING_CASH,
  teamOwnsCompleteColorSet,
  type CharacterId,
  type EmergencyRescueOffer,
  type PlayerId,
  type PublicGameState,
  type PublicReviveWindow,
  type PlayerColorId,
  type PublicTeam,
  type TeamId,
} from '@monopoly/shared';

/**
 * Display-only team derivations. The server decides every team rule; these helpers only read the public state it sent, so a
 * label, an accent or a button never disagrees with what the server will accept. Every one of them answers "no team" in Solo.
 */

export type PlayerRelation = 'SELF' | 'TEAMMATE' | 'OPPONENT';

export const REVIVABLE_LABEL = 'Có thể hồi sinh';
export const PERMANENT_ELIMINATION_LABEL = 'Đã bị loại vĩnh viễn';

export function isTeamGame(state: PublicGameState): boolean {
  return isTeamMode(state);
}

export function findTeam(state: PublicGameState, teamId: TeamId): PublicTeam | undefined {
  return state.boardState.teams.find(team => team.teamId === teamId);
}

/** The team a player belongs to while a 2v2 game is configured, else `null`. */
export function teamOfPlayer(state: PublicGameState, playerId: PlayerId): PublicTeam | null {
  const teamId = getPlayerTeamId(state, playerId);
  return teamId === null ? null : findTeam(state, teamId) ?? null;
}

/** How `otherPlayerId` relates to the viewer: themself, a teammate or an opponent. `null` in Solo or for a spectator. */
export function relationBetween(
  state: PublicGameState,
  viewerPlayerId: PlayerId | null,
  otherPlayerId: PlayerId,
): PlayerRelation | null {
  if (!isTeamMode(state) || viewerPlayerId === null) return null;
  if (viewerPlayerId === otherPlayerId) return 'SELF';
  const viewerTeam = getPlayerTeamId(state, viewerPlayerId);
  const otherTeam = getPlayerTeamId(state, otherPlayerId);
  if (viewerTeam === null || otherTeam === null) return null;
  return viewerTeam === otherTeam ? 'TEAMMATE' : 'OPPONENT';
}

export function relationLabel(relation: PlayerRelation | null): string | null {
  if (relation === 'TEAMMATE') return 'Đồng đội';
  if (relation === 'OPPONENT') return 'Đối thủ';
  return null;
}

/** "Còn 3 lượt", "Còn 2 lượt" and, with a single survivor turn left, "Cơ hội cuối". */
export function reviveTurnsLabel(turnsRemaining: number): string {
  return turnsRemaining <= 1 ? 'Cơ hội cuối' : `Còn ${turnsRemaining} lượt`;
}

export type ReviveStatus =
  | { kind: 'REVIVABLE'; window: PublicReviveWindow; turnsLabel: string }
  | { kind: 'PERMANENT' };

/**
 * The public elimination state of a player who is out of a 2v2 game by bankruptcy: still revivable (with how many survivor turns
 * are left) or permanently out. `null` for a player still in the game, one who left, and every Solo player.
 */
export function getReviveStatus(state: PublicGameState, playerId: PlayerId): ReviveStatus | null {
  if (!isTeamMode(state)) return null;
  const finished = state.boardState.finishedPlayers[playerId];
  if (!finished || finished.reason !== 'BANKRUPT') return null;
  const window = state.boardState.teamPlay.reviveWindows.find(candidate => candidate.playerId === playerId);
  return window
    ? { kind: 'REVIVABLE', window, turnsLabel: reviveTurnsLabel(window.turnsRemaining) }
    : { kind: 'PERMANENT' };
}

export interface RevivePrompt {
  window: PublicReviveWindow;
  revivedPlayerId: PlayerId;
  revivedName: string;
  cost: number;
  startingCash: number;
  balance: number;
  turnsLabel: string;
  /** False when the window opened during this very turn: the survivor's next turn is the first one that can revive. */
  startsThisTurn: boolean;
  canAfford: boolean;
}

/**
 * What the surviving teammate is offered during their own turn, or `null`. This only decides whether to show the option; the
 * server re-checks the turn, the window, the money and the revive-once rule when it is used.
 */
export function selectRevivePrompt(state: PublicGameState, viewerPlayerId: PlayerId | null): RevivePrompt | null {
  if (!isTeamMode(state) || viewerPlayerId === null || state.boardState.winner) return null;
  const viewer = state.players[viewerPlayerId];
  if (!viewer || state.boardState.currentPlayer.id !== viewerPlayerId) return null;
  if (state.boardState.paymentShortfall || state.turnInfo.pendingCardInteraction) return null;
  const turnIsOpen = !state.boardState.currentPlayer.hasMoved || Boolean(state.turnInfo.pendingLandingDecision);
  if (!turnIsOpen) return null;
  const window = state.boardState.teamPlay.reviveWindows.find(candidate => candidate.survivorPlayerId === viewerPlayerId);
  if (!window) return null;
  return {
    window,
    revivedPlayerId: window.playerId,
    revivedName: state.boardState.finishedPlayers[window.playerId]?.name ?? 'Đồng đội',
    cost: REVIVE_COST,
    startingCash: REVIVE_STARTING_CASH,
    balance: viewer.accountBalance,
    turnsLabel: reviveTurnsLabel(window.turnsRemaining),
    startsThisTurn: state.boardState.turnNumber > window.openedAtTurnNumber,
    canAfford: viewer.accountBalance >= REVIVE_COST,
  };
}

/** The open Emergency Rescue offer addressed to the viewer, if any. */
export function selectRescueOffer(state: PublicGameState, viewerPlayerId: PlayerId | null): EmergencyRescueOffer | null {
  const offer = state.boardState.paymentShortfall?.rescue ?? null;
  return offer && viewerPlayerId !== null && offer.rescuerPlayerId === viewerPlayerId ? offer : null;
}

/** Everything the victory screen needs about the winning team, derived from public state only. */
export interface TeamVictoryMember {
  playerId: PlayerId;
  name: string;
  characterId: CharacterId | null;
  color: PlayerColorId;
  /** Why a member is not standing at the end, or `null` for a member who was still in the game. */
  status: 'BANKRUPT' | 'LEFT' | null;
}

export interface TeamVictorySummary {
  team: PublicTeam;
  members: TeamVictoryMember[];
  /** Cash of the members still in the game; an eliminated member holds none. */
  totalCash: number;
  propertyCount: number;
  houseCount: number;
  hotelCount: number;
  /** District names (shared `colorGroups` keys) the team holds completely, in board order. */
  completedColorSets: string[];
}

/**
 * The winning team of a finished 2v2 game, or `null` for Solo and for a game that is not decided. Every member of the team is
 * listed, including one who was eliminated or left earlier: the victory belongs to the team.
 */
export function getTeamVictorySummary(state: PublicGameState): TeamVictorySummary | null {
  const teamId = state.boardState.winningTeamId;
  if (!teamId || !isTeamMode(state)) return null;
  const team = findTeam(state, teamId);
  if (!team) return null;

  const members = team.memberPlayerIds.flatMap((playerId): TeamVictoryMember[] => {
    const live = state.players[playerId];
    const finished = state.boardState.finishedPlayers[playerId];
    const source = live ?? finished;
    if (!source) return [];
    return [{
      playerId,
      name: source.name,
      characterId: source.characterId,
      color: source.color,
      status: live ? null : finished?.reason ?? null,
    }];
  });
  const memberIds = new Set(team.memberPlayerIds);
  const owned = Object.values(state.boardState.ownedProps).filter(property => memberIds.has(property.id));
  const holderId = members.find(member => member.status === null)?.playerId ?? members[0]?.playerId;
  return {
    team,
    members,
    totalCash: members.reduce((total, member) => total + (state.players[member.playerId]?.accountBalance ?? 0), 0),
    propertyCount: owned.length,
    houseCount: owned.reduce((total, property) => total + (property.houses === 5 ? 0 : property.houses), 0),
    hotelCount: owned.filter(property => property.houses === 5).length,
    completedColorSets: holderId
      ? Object.keys(colorGroups).filter(group => teamOwnsCompleteColorSet(state, holderId, group))
      : [],
  };
}
