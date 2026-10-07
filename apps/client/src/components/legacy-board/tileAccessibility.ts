import type { PublicGameState } from '@monopoly/shared';
import { tileState } from '@monopoly/shared';
import { formatMoney, getTileName } from '../../presentation';
import { teamOfPlayer } from '../../game/team/teamView';
import { getLandmarkVisual } from '../../game/ui/property/landmarkVisuals';
import type { Language } from '../../i18n/I18n';
import { translate } from '../../i18n/I18n';

/**
 * The accessible name of a tile button (the 40 semantic buttons of the WebGL board and the legacy tiles). A hotel is named by
 * the landmark that stands for it: "Có Khách sạn · Chùa Cầu".
 */
export function getTileAccessibilityLabel(tileId: number, state: PublicGameState, language: Language = 'vi'): string {
  const tile = tileState[tileId];
  const owned = state.boardState.ownedProps[tileId];
  const ownerName = owned
    ? state.players[owned.id]?.name
      ?? state.boardState.finishedPlayers[owned.id]?.name
      ?? translate('board.otherPlayer', language)
    : null;
  // 2v2: two teammates share the ownership colour, so the label names the team as well as the individual owner.
  const ownerTeam = owned ? teamOfPlayer(state, owned.id) : null;
  const playersHere = Object.values(state.players)
    .filter(player => player.currentTile === tileId)
    .map(player => player.name);
  const buildingLabel = owned && owned.houses > 0
    ? owned.houses === 5
      ? translate('board.hotelLandmark', language, { landmark: getLandmarkVisual(tileId)?.landmarkName ?? translate('board.hotelCount', language) })
      : translate('board.houseCount', language, { count: owned.houses })
    : null;
  return [
    translate('board.accessibleTile', language, { tileId, tileName: getTileName(tileId, language) }),
    typeof tile.price === 'number' ? translate('board.price', language, { price: formatMoney(tile.price) }) : null,
    ownerName ? translate('board.owner', language, {
      owner: ownerName,
      team: ownerTeam ? translate('board.teamSuffix', language, { teamName: ownerTeam.name }) : '',
    }) : null,
    buildingLabel ? translate('board.buildingCount', language, { building: buildingLabel }) : null,
    playersHere.length > 0 ? translate('board.playerHere', language, { players: playersHere.join(', ') }) : null,
    translate('board.openTileDetails', language),
  ].filter(Boolean).join('. ');
}
