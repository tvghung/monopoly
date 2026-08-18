import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import RaisedSvgTileIcon from './RaisedSvgTileIcon';
import { BOARD_SVG_TILE_ICON_ASSETS } from './boardIconAssets';

interface CardDeckVisualProps {
  panel: TilePanelLayout;
  kind: 'chance' | 'chest';
}

export default function CardDeckVisual({ panel, kind }: CardDeckVisualProps) {
  const icon = kind === 'chance'
    ? BOARD_SVG_TILE_ICON_ASSETS['chance-question-svg']
    : BOARD_SVG_TILE_ICON_ASSETS['fortune-wheel-svg'];
  return (
    <RaisedSvgTileIcon
      panel={panel}
      icon={icon}
      name={kind === 'chance' ? 'ChanceQuestionRaisedSvgIcon' : 'FortuneWheelRaisedSvgIcon'}
    />
  );
}
