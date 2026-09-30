import {
  colorGroups,
  RAILROAD_TILE_INDICES,
  UTILITY_TILE_INDICES,
  tileState,
  type CharacterId,
  type PlayerColorId,
  type PublicGameState,
  type RoomPlayerMeta,
} from '@monopoly/shared';
import { formatMoney, getTileName } from '../formatters';
import {
  getPropertyGroupVisualStyle, type PropertyMotif, type VisualTheme,
} from '../propertyVisualColors';
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
}

export interface DeedGroupPip {
  tileId: number;
  tileName: string;
  /** The owner's player color, or null while the tile is unowned. */
  ownerColor: PlayerColorId | null;
  /** The tile the card describes. */
  self: boolean;
}

export interface DeedGroupProgress {
  pips: DeedGroupPip[];
  total: number;
  /** How many tiles of this group the card's owner holds (0 when unowned). */
  ownedByOwner: number;
  /** For example "Minh sở hữu 2/3", or "Nhóm có 3 ô" while the tile is unowned. */
  text: string;
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
  /** Streets only: the complete-group rule as text. The client does not compute the doubled rent (known limitation). */
  groupRuleNote: string | null;
  tileType: string;
}

const HOUSE_COST_LABEL = 'Giá mỗi Nhà / Khách Sạn';

export const COMPLETE_GROUP_RULE_NOTE = 'Sở hữu cả nhóm: tiền thuê cơ bản gấp đôi và được xây Nhà.';

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
}

/**
 * Builds the deed card model for a tile from committed state. Display strings come from `getTileDetails`, the district
 * style from `propertyVisualColors`, the group from shared `colorGroups`; nothing here decides a rule.
 */
export function buildDeedCardModel({
  tileId, state, roomPlayers = [], theme,
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
    return {
      playerId,
      name: source.name,
      color: source.color,
      characterId: source.characterId ?? null,
    };
  };
  const owner = ownedProp ? playerInfo(ownedProp.id) : null;

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
          self: groupTileId === tileId,
        };
      });
      const ownedByOwner = ownedProp
        ? tiles.filter(groupTileId => state.boardState.ownedProps[groupTileId]?.id === ownedProp.id).length
        : 0;
      return {
        pips,
        total: tiles.length,
        ownedByOwner,
        text: owner ? `${owner.name} sở hữu ${ownedByOwner}/${tiles.length}` : `Nhóm có ${tiles.length} ô`,
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
    price: typeof tile.price === 'number' ? tile.price : null,
    priceText: typeof tile.price === 'number' ? formatMoney(tile.price) : null,
    houseCostText: kind === 'street' && typeof tile.houseCost === 'number' ? formatMoney(tile.houseCost) : null,
    rows,
    ruleLines: kind === 'special' ? details.map(detail => detail.label) : [],
    houses,
    developmentText: kind === 'street' ? developmentTextFor(houses, owned) : null,
    owner,
    group,
    groupRuleNote: kind === 'street' ? COMPLETE_GROUP_RULE_NOTE : null,
    tileType: tile.tileType,
  };
}
