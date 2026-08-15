import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { tileState } from '@monopoly/shared';
import { LayoutGroup } from 'framer-motion';
import './style/Board.css';
import stateContext from '../internal';
import displayPositionsContext from '../displayPositionsContext';
import Tile from './Tile';
import Dice from './Dice';
import Log from './Log';
import Dashboard from './Dashboard';
import tradePromptContext from '../tradePromptContext';
import { usePresentation } from '../game/presentation/PresentationProvider';

const getTilePosition = (index: number): string => {
  if (index === 0) return 'tile__start';
  if (index <= 10) return 'tile__horizontal--bottom';
  if (index <= 19) return 'tile__vertical--left';
  if (index <= 30) return 'tile__horizontal--top';
  return 'tile__vertical--right';
};

function Board() {
  const { canMutate, connected } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const [openTileId, setOpenTileId] = useState<number | null>(null);
  const lastOpenTileId = useRef<number | null>(null);

  // Presentation state intentionally lags authoritative positions while the
  // queue runs a safe, cancellable movement sequence.
  const displayPositions = presentationState.displayPositions;

  const [tradeTarget, setTradeTarget] = useState<number | null>(null);

  const openCard = useCallback((tileId: number) => {
    lastOpenTileId.current = tileId;
    setOpenTileId(tileId);
  }, []);

  const closeCard = useCallback(() => {
    const tileId = lastOpenTileId.current;
    setOpenTileId(null);
    if (tileId === null) return;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-tile-index="${tileId}"]`)?.focus();
    });
  }, []);

  // Close the property card with Escape or a click outside the board tile/card.
  useEffect(() => {
    if (openTileId === null) return undefined;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.Tile, .tile-back--container')) return;
      closeCard();
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCard();
    };

    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [closeCard, openTileId]);

  const openTradeForProperty = useCallback((tileID: number) => {
    if (canMutate) setTradeTarget(tileID);
  }, [canMutate]);

  const closeTrade = useCallback(() => {
    setTradeTarget(null);
  }, []);

  return (
    <tradePromptContext.Provider value={{
      tradeTarget: tradeTarget === null ? null : { tileID: tradeTarget },
      openTradeForProperty,
      closeTrade,
    }}
    >
      <displayPositionsContext.Provider value={displayPositions}>
        <section
          className="Board"
          aria-label="Bàn cờ Own the Block — Cờ Tỷ Phú Việt Nam"
          aria-busy={!connected}
          data-testid="game-board"
          inert={!connected}
        >
          <aside className="orientation-notice" role="status">
            <strong>Hãy xoay ngang thiết bị</strong>
            <span>Bàn cờ hiển thị tốt nhất ở chế độ ngang.</span>
          </aside>
          <LayoutGroup>
            {tileState.map((tile, index) => (
              <Tile
                key={index}
                tile={tile}
                id={index}
                position={getTilePosition(index)}
                isOpen={openTileId === index}
                onOpen={() => openCard(index)}
                onClose={closeCard}
              />
            ))}
          </LayoutGroup>
          <section className="center" aria-label="Khu vực điều khiển ván chơi">
            <Dice />
            <Log />
            <Dashboard />
          </section>
        </section>
      </displayPositionsContext.Provider>
    </tradePromptContext.Provider>
  );
}

export default Board;
