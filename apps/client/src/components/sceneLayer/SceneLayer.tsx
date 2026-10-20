import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { supportsWebGL } from '../../game/scene/fallback/webglSupport';
import SceneErrorBoundary from '../../game/scene/fallback/SceneErrorBoundary';
import { resolveConfiguredRenderTier } from '../../game/scene/render/renderQuality';
import { markSceneOnce } from '../../game/scene/render/warmup/sceneMarks';
import { useSettingsSelector } from '../../settings/selectors';
import { useTranslation } from '../../i18n/I18n';
import { GameScene, useBoardRenderModel } from '../BoardRenderSurface';
import { SceneLayerController } from './SceneLayerController';
import { SceneLayerContext } from './sceneLayerContext';
import { scheduleEarlyMount } from './sceneEarlyMount';
import './SceneLayer.css';

/** Where the player is, as far as the scene is concerned: in a lobby (a player, game not started), in a game (or a spectator), or in no room. */
export type ScenePhase = 'LOBBY' | 'GAME' | null;

/**
 * The scene, rendered into the layer's host element (08H Task 3). It reads the same model the board's own surface would, and what
 * the board owns (selection, callbacks) through the controller, so while there is no board nothing is selected and a click does nothing.
 */
function SceneLayerContent({ controller }: { controller: SceneLayerController }) {
  const { t } = useTranslation();
  const model = useBoardRenderModel();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    markSceneOnce('layer-mounted');
  }, []);
  return (
    <SceneErrorBoundary fallback={null} onError={controller.reportFailure}>
      <Suspense fallback={<div className="game-board__scene-loading" role="status">{t('board.sceneLoading')}</div>}>
        <GameScene
          model={model}
          hoverStore={controller.hoverStore}
          selectedTileId={snapshot.selectedTileId}
          onTileSelect={controller.selectTile}
          onRendererFailure={controller.reportFailure}
          loadingLabel={t('board.sceneLoading')}
          revealToken={snapshot.revealToken}
        />
      </Suspense>
    </SceneErrorBoundary>
  );
}

/**
 * Whether the lobby may build the scene ahead of the board: a player in a lobby, on a tier where a board is cheap enough to keep alive
 * (not `low`), once the lobby has been up for a moment and the browser is idle, with data saving off and a visible tab. `roomKey`
 * identifies the lobby, so a new room waits again.
 */
function useEarlyMountReady(enabled: boolean, roomKey: string | null): boolean {
  const graphicsQuality = useSettingsSelector(settings => settings.graphicsQuality);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || roomKey === null) return undefined;
    if (resolveConfiguredRenderTier(graphicsQuality) === 'low') return undefined;
    return scheduleEarlyMount(() => setReadyKey(roomKey));
  }, [enabled, graphicsQuality, roomKey]);
  return enabled && roomKey !== null && readyKey === roomKey;
}

interface SceneLayerProps {
  phase: ScenePhase;
  /** Identifies the room the lobby belongs to (the room code). */
  roomKey: string | null;
  children: ReactNode;
}

/**
 * The persistent 3D scene (Phase B3 follow-up, 08H Task 3, design A1). Wrap the app (under the state, presentation and settings
 * providers) with it. While a player waits in a lobby the scene is built, deferred and gated, into an invisible parking element;
 * when the board shows, its slot takes the scene's element and the first frame is drawn at once; when the next lobby shows (play
 * again) the scene stays. It is dropped when the player leaves the room, or when its renderer fails.
 */
export default function SceneLayer({ phase, roomKey, children }: SceneLayerProps) {
  const [controller] = useState(() => new SceneLayerController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const earlyReady = useEarlyMountReady(phase === 'LOBBY', roomKey);
  const webgl = supportsWebGL();
  // Once the scene exists it stays until the room ends: a board that leaves (a new lobby) must not take the scene with it.
  const [kept, setKept] = useState(false);
  const wanted = phase !== null && webgl && snapshot.failure === null && (snapshot.slotAttached || earlyReady);
  useEffect(() => {
    if (wanted) setKept(true);
  }, [wanted]);
  const inRoom = phase !== null && webgl && snapshot.failure === null;
  const mounted = inRoom && (wanted || kept);
  useEffect(() => {
    if (phase !== null) return;
    setKept(false);
    controller.reset();
  }, [controller, phase]);
  useEffect(() => {
    if (snapshot.failure) setKept(false);
  }, [snapshot.failure]);
  const parkingRef = useCallback((element: HTMLDivElement | null) => controller.setParking(element), [controller]);
  return (
    <SceneLayerContext.Provider value={controller}>
      {children}
      <div ref={parkingRef} className="scene-parking" aria-hidden="true" inert />
      {mounted ? createPortal(<SceneLayerContent controller={controller} />, controller.host) : null}
    </SceneLayerContext.Provider>
  );
}
