import {
  colorGroups,
  colorSetRentPercent,
  RAILROAD_TILE_INDICES,
  scaleRentPercent,
  UTILITY_TILE_INDICES,
  tileState,
  type CharacterId,
  type PlayerColorId,
  type PublicGameState,
  type RoomPlayerMeta,
  type TeamId,
} from '@monopoly/shared';
import { relationBetween, teamOfPlayer, type PlayerRelation } from '../../team/teamView';
import { formatMoney, getTileName } from '../formatters';
import {
  getPropertyGroupVisualStyle, type PropertyMotif, type VisualTheme,
} from '../propertyVisualColors';
import { getLandmarkVisual } from './landmarkVisuals';
import { getCurrentRentDetailIndex, getTileDetails } from './propertyDetails';

export type DeedKind = 'street' | 'railroad' | 'utility' | 'special';

export interface DeedRentRow {
  label: string;
  value?: string;
  /** The row in force for the current owner (street: development level; others: how many of their kind are held). */
  current: boolean;
  /** The row a street reaches after the next Nhà or Khách Sạn, marked in the development prompt. */
  next: boolean;
}

export interface DeedOwner {
  playerId: string;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  /** The owner's 2v2 team (its colour is the ownership accent); `null` in Solo. */
  team: { teamId: TeamId; name: string; color: PlayerColorId } | null;
  /** How the owner relates to the viewer, when the viewer is known and the game is 2v2. */
  relation: PlayerRelation | null;
}

export interface DeedGroupPip {
  tileId: number;
  tileName: string;
  /** The owner's player color (the team colour in 2v2), or null while the tile is unowned. */
  ownerColor: PlayerColorId | null;
  /** Who holds the tile: two teammates share one colour, so the name tells them apart. */
  ownerName: string | null;
  /** The tile the card describes. */
  self: boolean;
}

export interface DeedGroupProgress {
  pips: DeedGroupPip[];
  total: number;
  /** How many tiles of this group the card's owner holds (0 when unowned); in 2v2 the whole team's tiles count. */
  ownedByOwner: number;
  /** For example "Minh sở hữu 2/3" ("Đội Rồng sở hữu 2/3" in 2v2), or "Nhóm có 3 ô" while the tile is unowned. */
  text: string;
}

/** A completed colour set: the percent the rent is scaled to and what that makes of the rent in force right now. */
export interface DeedRentBonus {
  percent: number;
  /** "Đủ khu: tiền thuê ×1,5" or, for a team that holds the whole group, "Cả đội đủ khu: tiền thuê ×2". */
  text: string;
  /** The rent in force now with the bonus applied, formatted as money. */
  effectiveRentText: string;
}

/** The presentational model of one deed card: everything is resolved here so the component stays a pure view. */
export interface DeedCardModel {
  tileId: number;
  kind: DeedKind;
  name: string;
  /** "Nhóm Xanh nhạt", "Ga tàu", "Tiện ích"; null for special tiles. */
  groupLabel: string | null;
  headerColor: string;
  headerTextColor: string;
  tint: string;
  motif: PropertyMotif | null;
  /** Streets only: the landmark that stands as this street's hotel, with its flat picture (plan 05 §8.5). */
  landmark: { name: string; artUrl: string } | null;
  price: number | null;
  priceText: string | null;
  /** Cost of one Nhà / Khách Sạn, streets only. */
  houseCostText: string | null;
  /** The rent ladder (empty for special tiles). */
  rows: DeedRentRow[];
  /** Rule text of a special tile (start, jail, tax, chance ...). */
  ruleLines: string[];
  /** 0 to 5 (5 is a hotel); 0 when unowned. */
  houses: number;
  developmentText: string | null;
  owner: DeedOwner | null;
  group: DeedGroupProgress | null;
  /** Streets only: the colour-set rule as text (Solo: 1,5 lần; 2v2: cả đội đủ khu thì gấp đôi). */
  groupRuleNote: string | null;
  /** Streets only: set while the owner (Solo) or the owner's team (2v2) holds the whole group. */
  rentBonus: DeedRentBonus | null;
  tileType: string;
}

const HOUSE_COST_LABEL = 'Giá mỗi Nhà / Khách Sạn';

/** The colour-set rule as it is enforced: it scales rent only, and building never needs the whole group. */
export const COMPLETE_GROUP_RULE_NOTE = 'Sở hữu cả khu: tiền thuê của mọi ô trong khu nhân 1,5 lần. Xây Nhà không cần đủ khu.';
export const TEAM_GROUP_RULE_NOTE = 'Hai đồng đội cùng sở hữu cả khu: tiền thuê của mọi ô trong khu nhân đôi. Xây Nhà không cần đủ khu.';

const percentText = (percent: number): string => (percent === 150 ? '×1,5' : `×${percent / 100}`);

function kindOf(tileType: string): DeedKind {
  if (tileType === 'normal') return 'street';
  if (tileType === 'railroad') return 'railroad';
  if (tileType === 'company') return 'utility';
  return 'special';
}

function groupTiles(tileType: string, color: string | undefined): readonly number[] | null {
  if (tileType === 'normal' && color) return colorGroups[color] ?? null;
  if (tileType === 'railroad') return RAILROAD_TILE_INDICES;
  if (tileType === 'company') return UTILITY_TILE_INDICES;
  return null;
}

function developmentTextFor(houses: number, owned: boolean): string {
  if (!owned) return 'Chưa có chủ sở hữu';
  if (houses === 5) return '1 Khách sạn';
  return houses > 0 ? `${houses} Nhà` : 'Chưa xây';
}

export interface DeedCardModelInput {
  tileId: number;
  state: PublicGameState;
  roomPlayers?: readonly RoomPlayerMeta[];
  theme?: VisualTheme;
  /** The local player, so an owner can be marked as a teammate or an opponent in 2v2. */
  viewerPlayerId?: string | null;
}

/**
 * Builds the deed card model for a tile from committed state. Display strings come from `getTileDetails`, the district
 * style from `propertyVisualColors`, the group from shared `colorGroups`; nothing here decides a rule.
 */
export function buildDeedCardModel({
  tileId, state, roomPlayers = [], theme, viewerPlayerId = null,
}: DeedCardModelInput): DeedCardModel | null {
  const tile = tileState[tileId];
  if (!tile) return null;

  const kind = kindOf(tile.tileType);
  const visual = getPropertyGroupVisualStyle(
    kind === 'utility' ? 'utility' : tile.color,
    theme,
  );
  const ownedProp = state.boardState.ownedProps[tileId];
  const owned = Boolean(ownedProp);
  const houses = ownedProp?.houses ?? 0;

  const playerInfo = (playerId: string): DeedOwner | null => {
    const live = state.players[playerId];
    const finished = state.boardState.finishedPlayers[playerId];
    const meta = roomPlayers.find(candidate => candidate.playerId === playerId);
    const source = live ?? finished ?? meta;
    if (!source) return null;
    const team = teamOfPlayer(state, playerId);
    return {
      playerId,
      name: source.name,
      color: source.color,
      characterId: source.characterId ?? null,
      team: team ? { teamId: team.teamId, name: team.name, color: team.color } : null,
      relation: relationBetween(state, viewerPlayerId, playerId),
    };
  };
  const owner = ownedProp ? playerInfo(ownedProp.id) : null;
  const landmark = kind === 'street' ? getLandmarkVisual(tileId) : undefined;

  const details = getTileDetails(tile);
  const hasLadder = kind !== 'special';
  const sameTypeOwned = ownedProp
    ? Object.entries(state.boardState.ownedProps).filter(([otherId, property]) => (
      property.id === ownedProp.id && tileState[Number(otherId)]?.tileType === tile.tileType
    )).length
    : 1;
  const currentIndex = hasLadder ? getCurrentRentDetailIndex(tile, details, { houses, sameTypeOwned }) : null;
  const nextIndex = kind === 'street' && owned && currentIndex !== null && houses < 5 && currentIndex + 1 < details.length
    ? currentIndex + 1
    : null;
  // The house cost is its own line under the ladder, not a ladder step.
  const rows: DeedRentRow[] = hasLadder
    ? details.filter(detail => detail.label !== HOUSE_COST_LABEL).map((detail, index) => ({
      label: detail.label,
      value: detail.value,
      current: index === currentIndex,
      next: index === nextIndex,
    }))
    : [];

  const tiles = groupTiles(tile.tileType, tile.color);
  const group: DeedGroupProgress | null = tiles
    ? (() => {
      const pips = tiles.map<DeedGroupPip>(groupTileId => {
        const groupOwnerId = state.boardState.ownedProps[groupTileId]?.id;
        const groupOwner = groupOwnerId ? playerInfo(groupOwnerId) : null;
        return {
          tileId: groupTileId,
          tileName: getTileName(groupTileId),
          ownerColor: groupOwner?.color ?? null,
          ownerName: groupOwner?.name ?? null,
          self: groupTileId === tileId,
        };
      });
      // In 2v2 the team's holdings count together; in Solo only the card's owner's.
      const ownerTeamId = owner?.team?.teamId ?? null;
      const ownedByOwner = ownedProp
        ? tiles.filter(groupTileId => {
          const holderId = state.boardState.ownedProps[groupTileId]?.id;
          if (holderId === undefined) return false;
          return holderId === ownedProp.id
            || (ownerTeamId !== null && teamOfPlayer(state, holderId)?.teamId === ownerTeamId);
        }).length
        : 0;
      const holder = owner?.team ? `Đội ${owner.team.name}` : owner?.name;
      return {
        pips,
        total: tiles.length,
        ownedByOwner,
        text: owner ? `${holder} sở hữu ${ownedByOwner}/${tiles.length}` : `Nhóm có ${tiles.length} ô`,
      };
    })()
    : null;

  return {
    tileId,
    kind,
    name: getTileName(tileId),
    groupLabel: kind === 'special' ? null : visual.label,
    headerColor: visual.color,
    headerTextColor: visual.headerText,
    tint: visual.tint,
    motif: kind === 'special' ? null : visual.motif,
    landmark: landmark ? { name: landmark.landmarkName, artUrl: landmark.artUrl } : null,
    price: typeof tile.price === 'number' ? tile.price : null,
    priceText: typeof tile.price === 'number' ? formatMoney(tile.price) : null,
    houseCostText: kind === 'street' && typeof tile.houseCost === 'number' ? formatMoney(tile.houseCost) : null,
    rows,
    ruleLines: kind === 'special' ? details.map(detail => detail.label) : [],
    houses,
    developmentText: kind === 'street' ? developmentTextFor(houses, owned) : null,
    owner,
    group,
    groupRuleNote: kind === 'street'
      ? (state.boardState.gameMode === 'TEAM_2V2' ? TEAM_GROUP_RULE_NOTE : COMPLETE_GROUP_RULE_NOTE)
      : null,
    rentBonus: kind === 'street' && ownedProp ? buildRentBonus(state, tileId, ownedProp.id, ownedProp.houses) : null,
    tileType: tile.tileType,
  };
}

/** The colour-set bonus on a street, computed with the same shared rule the server charges, or null while there is none. */
function buildRentBonus(
  state: PublicGameState,
  tileId: number,
  ownerId: string,
  houses: number,
): DeedRentBonus | null {
  const percent = colorSetRentPercent(state, ownerId, tileId);
  if (percent <= 100) return null;
  const tile = tileState[tileId];
  const normal = houses > 0 && tile.rentTiers ? tile.rentTiers[houses - 1] : tile.rent ?? 0;
  return {
    percent,
    text: state.boardState.gameMode === 'TEAM_2V2'
      ? `Cả đội đủ khu: tiền thuê ${percentText(percent)}`
      : `Đủ khu: tiền thuê ${percentText(percent)}`,
    effectiveRentText: formatMoney(scaleRentPercent(normal, percent)),
  };
}
