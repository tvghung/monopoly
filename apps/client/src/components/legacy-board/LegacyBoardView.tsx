import { useContext } from 'react';
import { tileState } from '@monopoly/shared';
import { LayoutGroup } from 'framer-motion';
import stateContext from '../../internal';
import type { DiceRenderModel } from '../../game/scene/board/boardRenderModel';
import LegacyTile from './LegacyTile';
import LegacyDiceOverlay from './LegacyDiceOverlay';
import '../style/Board.css';
import { useTranslation } from '../../i18n/I18n';

const getTilePosition = (index: number): string => {
  if (index === 0) return 'tile__start';
  if (index <= 10) return 'tile__horizontal--bottom';
  if (index <= 19) return 'tile__vertical--left';
  if (index <= 30) return 'tile__horizontal--top';
  return 'tile__vertical--right';
};

interface LegacyBoardViewProps {
  selectedTileId: number | null;
  onTileSelect: (tileId: number) => void;
  dice: DiceRenderModel;
}

export default function LegacyBoardView({ selectedTileId, onTileSelect, dice }: LegacyBoardViewProps) {
  const { state } = useContext(stateContext);
  const { t } = useTranslation();
  return (
    <section className="Board legacy-board" aria-label={t('board.fallback')}>
      <LayoutGroup>
        {tileState.map((tile, index) => (
          <LegacyTile
            key={index}
            tile={tile}
            id={index}
            position={getTilePosition(index)}
            selected={selectedTileId === index}
            onSelect={() => onTileSelect(index)}
          />
        ))}
      </LayoutGroup>
      <LegacyDiceOverlay model={dice} />
      {!state.loaded ? <span className="legacy-board__loading">{t('board.loading')}</span> : null}
    </section>
  );
}
