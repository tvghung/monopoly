import type { PublicRoomState } from '@monopoly/shared';
import { OwnedPropertiesModal } from '../../../game/ui/property/OwnedPropertiesControl';
import PlayerPortfolioModal from '../../../game/ui/property/PlayerPortfolioModal';
import PropertyInspectionModal from '../../../game/ui/property/PropertyInspectionModal';
import tradePromptContext from '../../../tradePromptContext';
import DeedGallery from './DeedGallery';
import { noop, SurfaceProviders, withState, type SurfaceFixture } from './surfaceKit';

type Holdings = Record<number, number>;

/** Tiles of one player with their development level (0 to 5), laid over the fixture room's ownership. */
function hold(room: PublicRoomState, playerId: 'player-a' | 'player-b', levels: Holdings) {
  const color = playerId === 'player-a' ? 'red' : 'blue';
  Object.entries(levels).forEach(([tileId, houses]) => {
    room.gameState.boardState.ownedProps[Number(tileId)] = { id: playerId, color, houses };
  });
}

/** One tile in the inspection dialog; the trade hand-off is inert here. */
function inspect(tileId: number, mutate: (room: PublicRoomState) => void = noop) {
  return withState(
    { mutate },
    <tradePromptContext.Provider value={{ tradeTarget: null, openTradeForProperty: noop, closeTrade: noop }}>
      <PropertyInspectionModal tileId={tileId} onClose={noop} />
    </tradePromptContext.Provider>,
  );
}

/** Deed cards, property inspection and the portfolios (plan 04 T04.3, T04.5 and T04.6). */
export const INSPECTION_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'deeds',
    label: 'Deed cards (all variants)',
    group: 'Inspection',
    render: () => <SurfaceProviders><DeedGallery /></SurfaceProviders>,
  },
  {
    id: 'inspection-street',
    label: 'Inspection, street owned by another player',
    group: 'Inspection',
    // Bình owns two Nhà on Buôn Ma Thuột, so the viewer (An) can propose to buy; An holds one of the two other tiles.
    render: () => inspect(6, room => {
      hold(room, 'player-b', { 6: 2, 9: 0 });
      hold(room, 'player-a', { 8: 0 });
    }),
  },
  {
    id: 'inspection-own-street',
    label: 'Inspection, own street with houses',
    group: 'Inspection',
    // The viewer owns the whole blue district with houses, so "Bán Nhà" is enabled.
    render: () => inspect(37, room => hold(room, 'player-a', { 37: 3, 39: 1 })),
  },
  {
    id: 'inspection-railroad',
    label: 'Inspection, railroad',
    group: 'Inspection',
    render: () => inspect(5, room => {
      hold(room, 'player-b', { 5: 0, 15: 0 });
      hold(room, 'player-a', { 25: 0 });
    }),
  },
  {
    id: 'inspection-unowned',
    label: 'Inspection, unowned street',
    group: 'Inspection',
    render: () => inspect(11),
  },
  {
    id: 'inspection-special',
    label: 'Inspection, special tile (tax)',
    group: 'Inspection',
    render: () => inspect(4),
  },
  {
    id: 'assets',
    label: 'My properties (several districts)',
    group: 'Inspection',
    render: () => withState({
      mutate: room => {
        hold(room, 'player-a', {
          1: 2, 3: 5, 6: 0, 8: 1, 9: 0, 16: 0, 26: 3, 37: 0, 5: 0, 15: 0, 12: 0,
        });
        hold(room, 'player-b', { 21: 0, 23: 0 });
      },
    }, <OwnedPropertiesModal playerId="player-a" open onClose={noop} onSelect={noop} />),
  },
  {
    id: 'assets-empty',
    label: 'My properties (none yet)',
    group: 'Inspection',
    render: () => withState({}, <OwnedPropertiesModal playerId="player-a" open onClose={noop} onSelect={noop} />),
  },
  {
    id: 'player-portfolio',
    label: 'Player portfolio (another player)',
    group: 'Inspection',
    render: () => withState({
      mutate: room => {
        hold(room, 'player-b', {
          11: 1, 13: 0, 14: 0, 31: 4, 35: 0, 25: 0, 28: 0, 39: 5,
        });
        hold(room, 'player-a', { 1: 0 });
      },
    }, <PlayerPortfolioModal playerId="player-b" onClose={noop} onSelectTile={noop} />),
  },
];
