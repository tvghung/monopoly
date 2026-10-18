import { useContext, useLayoutEffect, useRef } from 'react';
import { markSceneOnce } from '../../game/scene/render/warmup/sceneMarks';
import { SceneLayerContext } from './sceneLayerContext';
import type { SceneBinding } from './SceneLayerController';

interface LayerSlotProps extends SceneBinding {
  /** False while the board plays on the legacy board: it then holds no scene. */
  active: boolean;
}

/**
 * The board's place for the persistent scene: takes the scene's element from the layer while mounted, and tells the layer what the
 * board owns (the selection and the callbacks). Renders nothing itself but the empty slot. Only mounted inside a `SceneLayer`.
 */
export default function LayerSlot({
  selectedTileId, onTileSelect, onRendererFailure, active,
}: LayerSlotProps) {
  const controller = useContext(SceneLayerContext);
  const slotRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!controller || !active) return undefined;
    return controller.bind({ selectedTileId, onTileSelect, onRendererFailure });
  }, [active, controller, onRendererFailure, onTileSelect, selectedTileId]);
  useLayoutEffect(() => {
    if (!controller || !active || !slotRef.current) return undefined;
    markSceneOnce('layer-attach');
    return controller.attachSlot(slotRef.current);
  }, [active, controller]);
  return active ? <div ref={slotRef} className="scene-slot" /> : null;
}
