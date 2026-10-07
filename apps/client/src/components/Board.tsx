import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import stateContext from '../internal';
// Keep Dashboard first: its stylesheet must precede Button.css in the bundle (the HUD imports Button).
import Dashboard from './Dashboard';
import displayPositionsContext from '../displayPositionsContext';
import tradePromptContext from '../tradePromptContext';
import { usePresentation } from '../game/presentation/PresentationProvider';
import { buildBoardRenderModel } from '../game/scene/board/boardRenderModel';
import SceneErrorBoundary from '../game/scene/fallback/SceneErrorBoundary';
import { supportsWebGL } from '../game/scene/fallback/webglSupport';
import PlayerPortfolioModal from '../game/ui/property/PlayerPortfolioModal';
import PropertyInspectionModal from '../game/ui/property/PropertyInspectionModal';
import TileOwnerHoverCard from '../game/ui/property/TileOwnerHoverCard';
import GameHud from '../game/ui/hud/GameHud';
import BoardAccessibilityControls from './BoardAccessibilityControls';
import LegacyBoardView from './legacy-board/LegacyBoardView';
import {
  resolveInitialRendererMode,
  type RendererMode,
} from './rendererMode';
import './style/BoardShell.css';
import { useTranslation } from '../i18n/I18n';

const GameScene = lazy(() => import('../game/scene/GameScene'));

export default function Board() {
  const { t, language } = useTranslation();
  const {
    state, connected, canMutate, roomPlayers, playerId, role,
  } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const [rendererMode, setRendererMode] = useState<RendererMode>(
    () => resolveInitialRendererMode(supportsWebGL()),
  );
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [portfolioPlayerId, setPortfolioPlayerId] = useState<string | null>(null);
  const [hoveredTileId, setHoveredTileId] = useState<number | null>(null);
  const [tradeTarget, setTradeTarget] = useState<number | null>(null);
  const displayPositions = presentationState.displayPositions;
  const renderModel = useMemo(
    () => buildBoardRenderModel(state, presentationState, roomPlayers, playerId, role, language),
    [language, playerId, presentationState, role, roomPlayers, state],
  );

  const selectTile = useCallback((tileId: number) => {
    setSelectedTileId(tileId);
  }, []);
  const closePortfolio = useCallback(() => {
    setPortfolioPlayerId(null);
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
          aria-label={t('board.boardLabel')}
          aria-busy={!connected}
          data-testid="game-board"
          inert={!connected}
        >
          <aside className="game-board__orientation-notice" role="status">
            <strong>{t('board.orientationTitle')}</strong>
            <span>{t('board.orientationBody')}</span>
          </aside>

          <section
            className={`game-board__renderer${rendererMode === 'legacy' ? ' game-board__renderer--legacy' : ''}`}
            data-renderer-mode={rendererMode}
            aria-label={t('board.boardArea')}
          >
            {rendererMode === 'webgl'
              ? (
                <SceneErrorBoundary fallback={legacyBoard} onError={switchToLegacy}>
                  <Suspense fallback={<div className="game-board__scene-loading" role="status">{t('board.sceneLoading')}</div>}>
                    <GameScene
                      model={renderModel}
                      hoveredTileId={hoveredTileId}
                      selectedTileId={selectedTileId}
                      onTileHover={setHoveredTileId}
                      onTileSelect={selectTile}
                      onRendererFailure={switchToLegacy}
                    />
                  </Suspense>
                </SceneErrorBoundary>
              )
              : legacyBoard}
            <Dashboard />
            <GameHud onSelectTile={selectTile} onSelectPlayer={setPortfolioPlayerId} />
            <TileOwnerHoverCard tileId={hoveredTileId} />
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
          <PlayerPortfolioModal playerId={portfolioPlayerId} onClose={closePortfolio} onSelectTile={selectTile} />
        </section>
      </displayPositionsContext.Provider>
    </tradePromptContext.Provider>
  );
}
