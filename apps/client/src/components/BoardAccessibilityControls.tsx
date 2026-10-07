import { useContext } from 'react';
import { tileState } from '@monopoly/shared';
import stateContext from '../internal';
import { getTileAccessibilityLabel } from './legacy-board/tileAccessibility';
import { useTranslation } from '../i18n/I18n';

interface BoardAccessibilityControlsProps {
  selectedTileId: number | null;
  onHover: (tileId: number | null) => void;
  onSelect: (tileId: number) => void;
}

export default function BoardAccessibilityControls({
  selectedTileId,
  onHover,
  onSelect,
}: BoardAccessibilityControlsProps) {
  const { state } = useContext(stateContext);
  const { language, t } = useTranslation();
  return (
    <nav className="game-board__accessibility-layer" aria-label={t('board.tilesNav')}>
      <ol className="sr-only">
        {tileState.map((_tile, tileId) => (
          <li key={tileId}>
            <button
              type="button"
              data-tile-index={tileId}
              aria-label={getTileAccessibilityLabel(tileId, state, language)}
              aria-expanded={selectedTileId === tileId}
              onFocus={() => onHover(tileId)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(tileId)}
            >
              {getTileAccessibilityLabel(tileId, state, language)}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
