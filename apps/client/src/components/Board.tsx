import {
  memo,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Smartphone } from 'lucide-react';
import stateContext from '../internal';
import { PORTRAIT_BLOCKED_QUERY, useMediaQuery } from '../design-system/useMediaQuery';
// Keep Dashboard first: its stylesheet must precede Button.css in the bundle (the HUD imports Button).
import Dashboard from './Dashboard';
import tradePromptContext from '../tradePromptContext';
import { createTileHoverStore, useTileHover, type TileHoverStore } from '../game/scene/board/tileHoverStore';
import { supportsWebGL } from '../game/scene/fallback/webglSupport';
import PlayerPortfolioModal from '../game/ui/property/PlayerPortfolioModal';
import PropertyInspectionModal from '../game/ui/property/PropertyInspectionModal';
import TileOwnerHoverCard from '../game/ui/property/TileOwnerHoverCard';
import { isTeamGame } from '../game/team/teamView';
import GameHud from '../game/ui/hud/GameHud';
import BoardAccessibilityControls from './BoardAccessibilityControls';
import BoardRenderSurface from './BoardRenderSurface';
import LayerSlot from './sceneLayer/LayerSlot';
import { SceneLayerContext } from './sceneLayer/sceneLayerContext';
import {
  resolveInitialRendererMode,
  type RendererMode,
} from './rendererMode';
import './style/BoardShell.css';
import { useTranslation } from '../i18n/I18n';

/**
 * Owns the trade prompt. It is its own component so that the permission to trade (a part of the room state that changes with
 * every update) re-renders this provider and its memoised value, not the whole board, and so that the value is only a new
 * object when the prompt or the permission really changed.
 */
function TradePromptProvider({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  const { canMutate } = useContext(stateContext);
  const [tradeTarget, setTradeTarget] = useState<number | null>(null);
  const openTradeForProperty = useCallback((tileId: number) => {
    if (!canMutate) return;
    onOpen();
    setTradeTarget(tileId);
  }, [canMutate, onOpen]);
  const closeTrade = useCallback(() => {
    setTradeTarget(null);
  }, []);
  const value = useMemo(() => ({
    tradeTarget: tradeTarget === null ? null : { tileID: tradeTarget },
    openTradeForProperty,
    closeTrade,
  }), [closeTrade, openTradeForProperty, tradeTarget]);
  return <tradePromptContext.Provider value={value}>{children}</tradePromptContext.Provider>;
}

/** The board's frame: busy and inert while disconnected. Its children are fixed elements, so a connection change renders only this. */
function BoardFrame({ label, children }: { label: string; children: ReactNode }) {
  const { connected } = useContext(stateContext);
  return (
    <section
      className="game-board"
      aria-label={label}
      aria-busy={!connected}
      data-testid="game-board"
      inert={!connected}
    >
      {children}
    </section>
  );
}

/** Hover card for the tile under the pointer, drawn only in a team game. */
function TeamHoverCard({ store }: { store: TileHoverStore }) {
  return <TileOwnerHoverCard tileId={useTileHover(store)} />;
}

/**
 * The card exists only in a 2v2 game, so only then does anything subscribe to the hover store: in a solo game a hover costs no
 * React render at all, not even a render that returns nothing.
 */
function HoveredTileOwnerCard({ store }: { store: TileHoverStore }) {
  const { state } = useContext(stateContext);
  return isTeamGame(state) ? <TeamHoverCard store={store} /> : null;
}

function Board() {
  const { t } = useTranslation();
  // Inside a persistent scene layer (the app) the scene is the layer's, drawn into this board's slot; on its own (tests, the UAT pages)
  // the board renders its scene itself. A renderer that already failed in the layer starts the board on the legacy board.
  const sceneLayer = useContext(SceneLayerContext);
  const [rendererMode, setRendererMode] = useState<RendererMode>(
    () => resolveInitialRendererMode(supportsWebGL() && !sceneLayer?.getFailure()),
  );
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [portfolioPlayerId, setPortfolioPlayerId] = useState<string | null>(null);
  const [ownHoverStore] = useState(createTileHoverStore);
  const hoverStore = sceneLayer ? sceneLayer.hoverStore : ownHoverStore;
  // Portrait on a phone: the rotate notice covers the game, and the game under it is inert (no touch, no keyboard) but not unmounted.
  // A tablet (600 px wide and up) plays in portrait as well.
  const portraitBlocked = useMediaQuery(PORTRAIT_BLOCKED_QUERY);

  const selectTile = useCallback((tileId: number) => {
    setSelectedTileId(tileId);
  }, []);
  const closePortfolio = useCallback(() => {
    setPortfolioPlayerId(null);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedTileId(null);
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
    hoverStore.set(null);
  }, [hoverStore]);

  return (
    <TradePromptProvider onOpen={clearSelection}>
      <>
        <BoardFrame label={t('board.boardLabel')}>
          <aside className="game-board__orientation-notice" role="status">
            <span className="game-board__orientation-icon" aria-hidden="true"><Smartphone /></span>
            <strong>{t('board.orientationTitle')}</strong>
            <span>{t('board.orientationBody')}</span>
          </aside>

          <section
            className={`game-board__renderer${rendererMode === 'legacy' ? ' game-board__renderer--legacy' : ''}`}
            data-renderer-mode={rendererMode}
            aria-label={t('board.boardArea')}
            inert={portraitBlocked}
          >
            {sceneLayer
              ? (
                <>
                  <LayerSlot
                    active={rendererMode === 'webgl'}
                    selectedTileId={selectedTileId}
                    onTileSelect={selectTile}
                    onRendererFailure={switchToLegacy}
                  />
                  {rendererMode === 'webgl'
                    ? null
                    : (
                      <BoardRenderSurface
                        rendererMode={rendererMode}
                        selectedTileId={selectedTileId}
                        hoverStore={hoverStore}
                        onTileSelect={selectTile}
                        onRendererFailure={switchToLegacy}
                      />
                    )}
                </>
              )
              : (
                <BoardRenderSurface
                  rendererMode={rendererMode}
                  selectedTileId={selectedTileId}
                  hoverStore={hoverStore}
                  onTileSelect={selectTile}
                  onRendererFailure={switchToLegacy}
                />
              )}
            <Dashboard />
            <GameHud onSelectTile={selectTile} onSelectPlayer={setPortfolioPlayerId} />
            <HoveredTileOwnerCard store={hoverStore} />
          </section>

          {rendererMode === 'webgl'
            ? (
              <BoardAccessibilityControls
                selectedTileId={selectedTileId}
                onHover={hoverStore.set}
                onSelect={selectTile}
              />
            )
            : null}

          <PropertyInspectionModal tileId={selectedTileId} onClose={closeInspection} />
          <PlayerPortfolioModal playerId={portfolioPlayerId} onClose={closePortfolio} onSelectTile={selectTile} />
        </BoardFrame>
      </>
    </TradePromptProvider>
  );
}

/** No props and no game state of its own: it re-renders for its own UI state only, never for a socket update or a presentation tick. */
export default memo(Board);
