import type {
  CharacterId,
  DeckCounts,
  DiceValue,
  PlayerColorId,
  PublicGameState,
  RoomPlayerMeta,
  RoomRole,
  TileType,
} from '@monopoly/shared';
import { tileState } from '@monopoly/shared';
import type { PresentationState } from '../../presentation/store/types';
import type { TileImpactSignal } from './motion/tileMotionTypes';
import { getTileName } from '../../../presentation';
import { selectPlayerHudViewModels } from '../../ui/hud/playerHudSelectors';
import { resolvePlayerStationSlots, type PlayerStationSlot } from '../../ui/stations/stationSlots';
import { PLAYER_STATION_WORLD_ANCHORS, type WorldAnchor } from '../stations/stationWorld';

export interface BoardTileRenderModel {
  tileId: number;
  name: string;
  tileType: TileType;
  price?: number;
  propertyColor?: string;
  ownerId?: string;
  ownerColor?: string;
  houses: number;
}

export interface CharacterPlayerModel {
  playerId: string;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  tileId: number;
  isActive: boolean;
  joinOrder: number;
}

export interface DiceRenderModel {
  dice: DiceValue;
  fromDice?: DiceValue;
  rollSequence: number;
  phase: 'HIDDEN' | 'ROLLING' | 'SETTLED';
  durationMs: number;
}

export interface PlayerStationRenderModel {
  playerId: string;
  name: string;
  slot: PlayerStationSlot;
  anchor: WorldAnchor;
  color: PlayerColorId;
  characterId: CharacterId | null;
  accountBalance: number;
  propertyCount: number;
  houseCount: number;
  hotelCount: number;
  status: 'ACTIVE' | 'BANKRUPT' | 'LEFT';
  isCurrentTurn: boolean;
  isConnected: boolean;
}

export interface BoardRenderModel {
  tiles: BoardTileRenderModel[];
  players: CharacterPlayerModel[];
  dice: DiceRenderModel;
  tileImpacts: readonly TileImpactSignal[];
  characterMovements: PresentationState['characterMovements'];
  characterLandings: PresentationState['characterLandings'];
  characterReactions: PresentationState['characterReactions'];
  balanceDeltas: PresentationState['balanceDeltas'];
  ownershipChanges: PresentationState['ownershipChanges'];
  developmentChanges: PresentationState['developmentChanges'];
  goCrossings: PresentationState['goCrossings'];
  destinationPreview: PresentationState['destinationPreview'];
  moneyTransfers: PresentationState['moneyTransfers'];
  cardPresentation: PresentationState['cardPresentation'];
  deckCounts: DeckCounts;
  stations: PlayerStationRenderModel[];
  animationSpeedMultiplier: number;
  reducedMotion: boolean;
  presentationResetEpoch: number;
}

function resolveOwnerColor(
  state: PublicGameState,
  ownerId: string,
  fallbackColor: string,
): string {
  return state.players[ownerId]?.color
    ?? state.boardState.finishedPlayers[ownerId]?.color
    ?? fallbackColor;
}

export function buildBoardRenderModel(
  state: PublicGameState,
  presentationState: PresentationState,
  roomPlayers: readonly RoomPlayerMeta[] = [],
  viewerPlayerId: string | null = null,
  viewerRole: RoomRole | null = null,
): BoardRenderModel {
  const tiles = tileState.map((tile, tileId): BoardTileRenderModel => {
    const owned = state.boardState.ownedProps[tileId];
    return {
      tileId,
      name: getTileName(tileId),
      tileType: tile.tileType,
      ...(typeof tile.price === 'number' ? { price: tile.price } : {}),
      ...(tile.color ? { propertyColor: tile.color } : {}),
      ...(owned
        ? {
          ownerId: owned.id,
          ownerColor: resolveOwnerColor(state, owned.id, owned.color),
          houses: presentationState.displayDevelopmentLevels[tileId] ?? owned.houses,
        }
        : { houses: 0 }),
    };
  });

  const activePlayerId = presentationState.displayActivePlayerId
    ?? state.boardState.currentPlayer.id;
  const roomOrder = new Map(roomPlayers.map(player => [player.playerId, player]));
  const players = Object.entries(state.players)
    .map(([playerId, player]): CharacterPlayerModel => ({
      playerId,
      name: player.name,
      color: player.color,
      characterId: player.characterId ?? roomOrder.get(playerId)?.characterId ?? null,
      tileId: presentationState.displayPositions[playerId] ?? player.currentTile,
      isActive: playerId === activePlayerId,
      joinOrder: roomOrder.get(playerId)?.joinOrder ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => left.joinOrder - right.joinOrder || left.playerId.localeCompare(right.playerId));

  const activeDice = presentationState.diceRoll;
  const dice = activeDice?.dice ?? presentationState.displayDice;
  const diceRollSequence = activeDice?.rollSequence ?? presentationState.displayRollSequence;
  const stationSlots = resolvePlayerStationSlots(roomPlayers, viewerPlayerId, viewerRole);
  const stationViews = selectPlayerHudViewModels(state, activePlayerId, roomPlayers);
  const stations = stationViews.flatMap((station): PlayerStationRenderModel[] => {
    const slot = stationSlots.get(station.playerId);
    if (!slot) return [];
    return [{
      playerId: station.playerId,
      name: station.name,
      slot,
      anchor: PLAYER_STATION_WORLD_ANCHORS[slot],
      color: station.color,
      characterId: station.characterId,
      accountBalance: presentationState.displayBalances[station.playerId] ?? station.money,
      propertyCount: station.propertyCount,
      houseCount: station.houseCount,
      hotelCount: station.hotelCount,
      status: station.isBankrupt ? 'BANKRUPT' : station.hasLeft ? 'LEFT' : 'ACTIVE',
      isCurrentTurn: station.isCurrentTurn,
      isConnected: station.isConnected,
    }];
  });

  // LIVE_UPDATE card visuals are emitted by the presentation queue only. A
  // reset/sync hydrates the authoritative interaction into PresentationStore,
  // so a live snapshot cannot skip movement and landing.
  const cardPresentation = presentationState.cardPresentation;

  return {
    tiles,
    players,
    dice: {
      dice: { ...dice },
      ...(activeDice?.fromDice ? { fromDice: { ...activeDice.fromDice } } : {}),
      rollSequence: diceRollSequence,
      phase: activeDice
        ? 'ROLLING'
        : presentationState.displayRollSequence > 0 ? 'SETTLED' : 'HIDDEN',
      durationMs: activeDice?.durationMs ?? 0,
    },
    tileImpacts: presentationState.tileImpacts,
    characterMovements: presentationState.characterMovements,
    characterLandings: presentationState.characterLandings,
    characterReactions: presentationState.characterReactions,
    balanceDeltas: presentationState.balanceDeltas,
    ownershipChanges: presentationState.ownershipChanges,
    developmentChanges: presentationState.developmentChanges,
    goCrossings: presentationState.goCrossings,
    destinationPreview: presentationState.destinationPreview,
    moneyTransfers: presentationState.moneyTransfers,
    cardPresentation,
    deckCounts: { ...state.deckCounts },
    stations,
    animationSpeedMultiplier: presentationState.animationSpeedMultiplier,
    reducedMotion: presentationState.reducedMotion,
    presentationResetEpoch: presentationState.presentationResetEpoch,
  };
}
