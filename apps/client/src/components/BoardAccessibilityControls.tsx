import { useContext } from 'react';
import { tileState } from '@monopoly/shared';
import stateContext from '../internal';
import { getTileAccessibilityLabel } from './legacy-board/tileAccessibility';

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
  return (
    <nav className="game-board__accessibility-layer" aria-label="Các ô trên bàn cờ">
      <ol className="sr-only">
        {tileState.map((_tile, tileId) => (
          <li key={tileId}>
            <button
              type="button"
              data-tile-index={tileId}
              aria-label={getTileAccessibilityLabel(tileId, state)}
              aria-expanded={selectedTileId === tileId}
              onFocus={() => onHover(tileId)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(tileId)}
            >
              {getTileAccessibilityLabel(tileId, state)}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
