import { SOLO_COLOR_SET_RENT_PERCENT, TEAM_COLOR_SET_RENT_PERCENT, TEAM_SIZE } from './rules';
import { colorGroups, RAILROAD_TILE_INDICES, UTILITY_TILE_INDICES } from './tileState';
import { TEAM_IDS, TEAM_SLOTS } from './types';
import type { DebtClaim, GameMode, PlayerId, TeamId, TeamSlot } from './types';

/**
 * Team rules that both the authoritative server and the client display need, written once over the smallest state view that
 * both `GameState` and `PublicGameState` satisfy. Nothing here mutates anything, and every helper answers "no team" in a Solo
 * game, so Solo logic that calls them is unchanged: the server enforces, the client only shows the same answer.
 */
export interface TeamAwareState {
  boardState: {
    gameMode: GameMode;
    finishedPlayers: Readonly<Record<PlayerId, { teamId: TeamId }>>;
    ownedProps: Readonly<Record<number, { id: PlayerId }>>;
  };
  players: Readonly<Record<PlayerId, { teamId: TeamId }>>;
}

export const isTeamMode = (state: Pick<TeamAwareState, 'boardState'>): boolean => (
  state.boardState.gameMode === 'TEAM_2V2'
);

/** The player's team while a 2v2 game is configured, `null` in Solo or for a player the game does not know. */
export const getPlayerTeamId = (state: TeamAwareState, playerId: PlayerId): TeamId | null => {
  if (!isTeamMode(state)) return null;
  return state.players[playerId]?.teamId ?? state.boardState.finishedPlayers[playerId]?.teamId ?? null;
};

export const getOpposingTeamId = (teamId: TeamId): TeamId => (
  teamId === TEAM_IDS[0] ? TEAM_IDS[1] : TEAM_IDS[0]
);

/** True only in 2v2 for two different players on the same team (eliminated players still belong to their team). */
export const areTeammates = (state: TeamAwareState, firstPlayerId: PlayerId, secondPlayerId: PlayerId): boolean => {
  if (firstPlayerId === secondPlayerId) return false;
  const firstTeam = getPlayerTeamId(state, firstPlayerId);
  return firstTeam !== null && firstTeam === getPlayerTeamId(state, secondPlayerId);
};

/** The players of a team who are still in the game. */
export const teamActivePlayerIds = (state: TeamAwareState, teamId: TeamId): PlayerId[] => (
  isTeamMode(state)
    ? Object.entries(state.players).filter(([, player]) => player.teamId === teamId).map(([playerId]) => playerId)
    : []
);

/** Every player of a team the game still remembers: active ones first, then eliminated or departed ones. */
export const getTeamMemberIds = (state: TeamAwareState, teamId: TeamId): PlayerId[] => {
  if (!isTeamMode(state)) return [];
  const active = teamActivePlayerIds(state, teamId);
  const finished = Object.entries(state.boardState.finishedPlayers)
    .filter(([playerId, player]) => player.teamId === teamId && !state.players[playerId])
    .map(([playerId]) => playerId);
  return [...active, ...finished];
};

/** The other members of the player's team, whatever their state. Empty in Solo. */
export const getTeammateIds = (state: TeamAwareState, playerId: PlayerId): PlayerId[] => {
  const teamId = getPlayerTeamId(state, playerId);
  return teamId === null ? [] : getTeamMemberIds(state, teamId).filter(memberId => memberId !== playerId);
};

/** Where a lobby player sits: their team and the seat inside it. Shared by the server rules and the lobby display. */
export interface SeatHolder {
  playerId: PlayerId;
  teamId: TeamId;
  teamSlot: TeamSlot;
}

/** The holder of one seat of a team, or `undefined` when it is empty. */
export const seatHolderAt = <Holder extends SeatHolder>(
  holders: readonly Holder[],
  teamId: TeamId,
  teamSlot: TeamSlot,
): Holder | undefined => holders.find(holder => holder.teamId === teamId && holder.teamSlot === teamSlot);

/** The lowest empty seat of a team, or `null` when the team is full. */
export const firstFreeTeamSlot = (holders: readonly SeatHolder[], teamId: TeamId): TeamSlot | null => (
  TEAM_SLOTS.find(teamSlot => seatHolderAt(holders, teamId, teamSlot) === undefined) ?? null
);

/** The colour group (district) a street belongs to, or `null` for any tile that is not a street. */
export const colorGroupOfTile = (tileID: number): string | null => (
  Object.entries(colorGroups).find(([, tiles]) => tiles.includes(tileID))?.[0] ?? null
);

/** Solo: one player owns every street of the colour group. */
export const ownsCompleteColorSet = (state: TeamAwareState, ownerId: PlayerId, colorGroup: string): boolean => {
  const tiles = colorGroups[colorGroup];
  return Boolean(tiles) && tiles.every(tileID => state.boardState.ownedProps[tileID]?.id === ownerId);
};

/**
 * 2v2: the owner and their teammate together own every street of the colour group, in any split (a team that holds all of it
 * through one member counts too). In Solo this is false: use `ownsCompleteColorSet`.
 */
export const teamOwnsCompleteColorSet = (state: TeamAwareState, ownerId: PlayerId, colorGroup: string): boolean => {
  if (!isTeamMode(state)) return false;
  const tiles = colorGroups[colorGroup];
  if (!tiles || tiles.length === 0) return false;
  return tiles.every(tileID => {
    const holder = state.boardState.ownedProps[tileID]?.id;
    return holder !== undefined && (holder === ownerId || areTeammates(state, ownerId, holder));
  });
};

/**
 * The percent a street's normal rent (base or building tier) is scaled to once its colour group is complete: 100 when it is
 * not, `SOLO_COLOR_SET_RENT_PERCENT` when one Solo player holds the group, `TEAM_COLOR_SET_RENT_PERCENT` when a 2v2 team does.
 * It only scales rent: building is never gated on owning the group.
 */
export const colorSetRentPercent = (state: TeamAwareState, ownerId: PlayerId, tileID: number): number => {
  const colorGroup = colorGroupOfTile(tileID);
  if (colorGroup === null) return 100;
  if (isTeamMode(state)) return teamOwnsCompleteColorSet(state, ownerId, colorGroup) ? TEAM_COLOR_SET_RENT_PERCENT : 100;
  return ownsCompleteColorSet(state, ownerId, colorGroup) ? SOLO_COLOR_SET_RENT_PERCENT : 100;
};

const countHeld = (state: TeamAwareState, ownerId: PlayerId, tiles: readonly number[]): number => (
  tiles.filter(tileID => {
    const holder = state.boardState.ownedProps[tileID]?.id;
    return holder !== undefined && (holder === ownerId || areTeammates(state, ownerId, holder));
  }).length
);

/** Ga the owner holds for rent purposes: their own, plus their teammate's in 2v2. Solo counts only the owner's. */
export const effectiveRailroadOwnershipCount = (state: TeamAwareState, ownerId: PlayerId): number => (
  countHeld(state, ownerId, RAILROAD_TILE_INDICES)
);

/** Công Ty the owner holds for rent purposes: their own, plus their teammate's in 2v2. Solo counts only the owner's. */
export const effectiveUtilityOwnershipCount = (state: TeamAwareState, ownerId: PlayerId): number => (
  countHeld(state, ownerId, UTILITY_TILE_INDICES)
);

export interface EmergencyRescuePlan {
  /** Everything the debtor still owes across their open claims in the queue. */
  shortfall: number;
  /** What leaves the rescuer's own balance: the shortfall minus claims that are owed to the rescuer (those cost nothing). */
  payable: number;
  /** The open claims of the debtor, in queue order, that an acceptance settles. */
  claimIds: string[];
}

/**
 * What a rescue of `debtorPlayerId` by `rescuerPlayerId` would settle. It covers every open claim of the debtor from the active
 * one on, because bankruptcy would void all of them: a rescue of only the first would still end in elimination.
 */
export const planEmergencyRescue = (
  claims: readonly Pick<DebtClaim, 'claimId' | 'debtorPlayerId' | 'creditor' | 'creditorPlayerId' | 'remainingAmount' | 'status'>[],
  activeClaimIndex: number,
  debtorPlayerId: PlayerId,
  rescuerPlayerId: PlayerId,
): EmergencyRescuePlan => {
  const plan: EmergencyRescuePlan = { shortfall: 0, payable: 0, claimIds: [] };
  claims.forEach((claim, index) => {
    if (index < activeClaimIndex || claim.debtorPlayerId !== debtorPlayerId) return;
    if (claim.status === 'SETTLED' || claim.status === 'BANKRUPT' || claim.remainingAmount <= 0) return;
    plan.shortfall += claim.remainingAmount;
    plan.claimIds.push(claim.claimId);
    if (!(claim.creditor === 'PLAYER' && claim.creditorPlayerId === rescuerPlayerId)) {
      plan.payable += claim.remainingAmount;
    }
  });
  return plan;
};

/**
 * The 2v2 turn order: teams alternate (A1, B1, A2, B2). The starter (chosen by the usual dice) goes first, then the opposing
 * team's members and the starter's teammate in join order, so two teammates are never adjacent.
 */
export function buildAlternatingTurnOrder(
  starterId: PlayerId,
  members: Readonly<Record<TeamId, readonly PlayerId[]>>,
): PlayerId[] {
  const starterTeam = TEAM_IDS.find(teamId => members[teamId].includes(starterId));
  if (!starterTeam) throw new RangeError('Người đi đầu không thuộc đội nào.');
  const opposingTeam = getOpposingTeamId(starterTeam);
  const teammates = members[starterTeam].filter(playerId => playerId !== starterId);
  const opponents = members[opposingTeam];
  if (teammates.length !== TEAM_SIZE - 1 || opponents.length !== TEAM_SIZE) {
    throw new RangeError('Mỗi đội 2v2 phải có đúng 2 người chơi.');
  }
  return [starterId, opponents[0], teammates[0], opponents[1]];
}
