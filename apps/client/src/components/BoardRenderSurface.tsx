import {
  lazy,
  memo,
  Suspense,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import stateContext from '../internal';
import { usePresentationSelector } from '../game/presentation/usePresentationSelector';
import {
  buildBoardRenderModel,
  sameScenePresentation,
  selectScenePresentation,
  type BoardRenderModel,
} from '../game/scene/board/boardRenderModel';
import { shareStructurally } from '../game/scene/board/shareStructurally';
import type { TileHoverStore } from '../game/scene/board/tileHoverStore';
import SceneErrorBoundary from '../game/scene/fallback/SceneErrorBoundary';
import LegacyBoardView from './legacy-board/LegacyBoardView';
import type { RendererMode } from './rendererMode';
import { useTranslation } from '../i18n/I18n';

const GameScene = lazy(() => import('../game/scene/GameScene'));

/**
 * `model` with every part that did not change since the last render kept as the same object, so the memoised scene and its
 * layers re-render only for the parts that changed. Equal data never makes a new reference; changed data always does.
 */
function useSharedRenderModel(next: BoardRenderModel): BoardRenderModel {
  const committedRef = useRef<BoardRenderModel | null>(null);
  const model = useMemo(
    () => (committedRef.current ? shareStructurally(committedRef.current, next) : next),
    [next],
  );
  useLayoutEffect(() => {
    committedRef.current = model;
  }, [model]);
  return model;
}

interface BoardRenderSurfaceProps {
  rendererMode: RendererMode;
  selectedTileId: number | null;
  hoverStore: TileHoverStore;
  onTileSelect: (tileId: number) => void;
  onRendererFailure: (error?: Error) => void;
}

/**
 * The board's picture: the 3D scene, or the legacy DOM board when WebGL is unavailable or failed. It is the only part of
 * the board that reads the game state and the presentation state, and it reads the presentation state as the slice the scene
 * draws (not the whole state), so a tick that changes nothing the scene shows does not render it. A render that rebuilds the
 * model from an unchanged slice yields the same model, and the memoised scene then does not render at all.
 */
function BoardRenderSurface({
  rendererMode,
  selectedTileId,
  hoverStore,
  onTileSelect,
  onRendererFailure,
}: BoardRenderSurfaceProps) {
  const { t, language } = useTranslation();
  const {
    state, roomPlayers, playerId, role,
  } = useContext(stateContext);
  const presentation = usePresentationSelector(selectScenePresentation, sameScenePresentation);
  const builtModel = useMemo(
    () => buildBoardRenderModel(state, presentation, roomPlayers, playerId, role, language),
    [language, playerId, presentation, role, roomPlayers, state],
  );
  const model = useSharedRenderModel(builtModel);

  const legacyBoard = (
    <LegacyBoardView
      selectedTileId={selectedTileId}
      onTileSelect={onTileSelect}
      dice={model.dice}
    />
  );
  if (rendererMode !== 'webgl') return legacyBoard;
  return (
    <SceneErrorBoundary fallback={legacyBoard} onError={onRendererFailure}>
      <Suspense fallback={<div className="game-board__scene-loading" role="status">{t('board.sceneLoading')}</div>}>
        <GameScene
          model={model}
          hoverStore={hoverStore}
          selectedTileId={selectedTileId}
          onTileSelect={onTileSelect}
          onRendererFailure={onRendererFailure}
        />
      </Suspense>
    </SceneErrorBoundary>
  );
}

export default memo(BoardRenderSurface);
