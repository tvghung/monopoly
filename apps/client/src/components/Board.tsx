import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import stateContext from '../internal';
import displayPositionsContext from '../displayPositionsContext';
import tradePromptContext from '../tradePromptContext';
import { usePresentation } from '../game/presentation/PresentationProvider';
import { buildBoardRenderModel } from '../game/scene/board/boardRenderModel';
import SceneErrorBoundary from '../game/scene/fallback/SceneErrorBoundary';
import { supportsWebGL } from '../game/scene/fallback/webglSupport';
import PropertyInspectionModal from '../game/ui/property/PropertyInspectionModal';
import OwnedPropertiesControl from '../game/ui/property/OwnedPropertiesControl';
import PlayerHud from '../game/ui/hud/PlayerHud';
import RollControl from '../game/ui/hud/RollControl';
import BoardAccessibilityControls from './BoardAccessibilityControls';
import LegacyBoardView from './legacy-board/LegacyBoardView';
import Log from './Log';
import Dashboard from './Dashboard';
import {
  resolveInitialRendererMode,
  type RendererMode,
} from './rendererMode';
import './style/BoardShell.css';

const GameScene = lazy(() => import('../game/scene/GameScene'));

export default function Board() {
  const { state, connected, canMutate, roomPlayers } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const [rendererMode, setRendererMode] = useState<RendererMode>(
    () => resolveInitialRendererMode(supportsWebGL()),
  );
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [hoveredTileId, setHoveredTileId] = useState<number | null>(null);
  const [tradeTarget, setTradeTarget] = useState<number | null>(null);
  const displayPositions = presentationState.displayPositions;
  const renderModel = useMemo(
    () => buildBoardRenderModel(state, presentationState, roomPlayers),
    [presentationState, roomPlayers, state],
  );

  const selectTile = useCallback((tileId: number) => {
    setSelectedTileId(tileId);
  }, []);
  const openTradeForProperty = useCallback((tileId: number) => {
    if (!canMutate) return;
    setSelectedTileId(null);
    setTradeTarget(tileId);
  }, [canMutate]);
  const closeTrade = useCallback(() => {
    setTradeTarget(null);
  }, []);
  const closeInspection = useCallback(() => {
    const tileId = selectedTileId;
    setSelectedTileId(null);
    if (tileId === null || typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-tile-index="${tileId}"]`)?.focus();
    });
  }, [selectedTileId]);
  const switchToLegacy = useCallback((error?: Error) => {
    if (error) {
      console.error('Switching to the legacy board fallback after a renderer error.', error);
    }
    setRendererMode('legacy');
    setHoveredTileId(null);
  }, []);

  const legacyBoard = (
    <LegacyBoardView
      selectedTileId={selectedTileId}
      onTileSelect={selectTile}
      dice={renderModel.dice}
    />
  );

  return (
    <tradePromptContext.Provider value={{
      tradeTarget: tradeTarget === null ? null : { tileID: tradeTarget },
      openTradeForProperty,
      closeTrade,
    }}
    >
      <displayPositionsContext.Provider value={displayPositions}>
        <section
          className="game-board"
          aria-label="Bàn cờ Own the Block — Cờ Tỷ Phú Việt Nam"
          aria-busy={!connected}
          data-testid="game-board"
          inert={!connected}
        >
          <aside className="game-board__orientation-notice" role="status">
            <strong>Hãy xoay ngang thiết bị</strong>
            <span>Bàn cờ hiển thị tốt nhất ở chế độ ngang.</span>
          </aside>

          <section
            className={`game-board__renderer${rendererMode === 'legacy' ? ' game-board__renderer--legacy' : ''}`}
            data-renderer-mode={rendererMode}
            aria-label="Khu vực bàn cờ trực quan"
          >
            {rendererMode === 'webgl'
              ? (
                <SceneErrorBoundary fallback={legacyBoard} onError={switchToLegacy}>
                  <Suspense fallback={<div className="game-board__scene-loading" role="status">Đang dựng bàn cờ…</div>}>
                    <GameScene
                      model={renderModel}
                      hoveredTileId={hoveredTileId}
                      selectedTileId={selectedTileId}
                      onTileHover={setHoveredTileId}
                      onTileSelect={selectTile}
                    />
                  </Suspense>
                </SceneErrorBoundary>
              )
              : legacyBoard}
            <PlayerHud
              activePlayerId={presentationState.displayActivePlayerId ?? state.boardState.currentPlayer.id}
            />
            <Dashboard />
            <RollControl />
            <OwnedPropertiesControl onSelect={selectTile} />
            <Log />
          </section>

          {rendererMode === 'webgl'
            ? (
              <BoardAccessibilityControls
                selectedTileId={selectedTileId}
                onHover={setHoveredTileId}
                onSelect={selectTile}
              />
            )
            : null}

          <PropertyInspectionModal tileId={selectedTileId} onClose={closeInspection} />
        </section>
      </displayPositionsContext.Provider>
    </tradePromptContext.Provider>
  );
}
