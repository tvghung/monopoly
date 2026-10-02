import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { DevelopmentChangeSignal } from '../../presentation/store/types';
import { presentationTiming } from '../../presentation/timings';
import type { BoardTileRenderModel } from '../board/boardRenderModel';
import { useTileMotionController } from '../board/motion/TileMotionProvider';
import ConstructionPuff from './ConstructionPuff';
import { getHouseScale, planHouseAnimations, type HouseAnimation } from './tubeHouseAnimation';
import {
  applyTubeHouseColors,
  buildTubeHouseEntries,
  createTubeHouseMeshes,
  disposeTubeHouseMeshes,
  sameTubeHouseEntries,
  writeTubeHouseMatrices,
  type TubeHouseEntry,
} from './tubeHouseMeshes';
import { getScaledConstructionBurstDuration } from './constructionTiming';
import { getTubeHouseWorldPlacement } from './tubeHouseLayout';

interface TubeHouseInstancesProps {
  tiles: readonly BoardTileRenderModel[];
  developmentChanges: ReadonlyMap<number, DevelopmentChangeSignal>;
  reducedMotion: boolean;
}

/** The model changes identity often; the houses only change when the rows do. */
function useStableEntries(next: TubeHouseEntry[]): TubeHouseEntry[] {
  const ref = useRef(next);
  if (!sameTubeHouseEntries(ref.current, next)) ref.current = next;
  return ref.current;
}

/**
 * Every tube house of the board in three instanced meshes (plan 05 §8.2): 3 main-pass draws and 3 shadow-pass draws however
 * many houses stand. The pop animation of the Phase 4 schedule runs on the instance matrices; the dust puffs are small
 * separate instanced meshes that exist only while a house is being built.
 */
export default function TubeHouseInstances({ tiles, developmentChanges, reducedMotion }: TubeHouseInstancesProps) {
  const invalidate = useThree(state => state.invalidate);
  const motionController = useTileMotionController();
  const meshes = useMemo(() => createTubeHouseMeshes(), []);
  const animations = useMemo(
    () => planHouseAnimations(tiles, developmentChanges, reducedMotion),
    [tiles, developmentChanges, reducedMotion],
  );
  const hotelTiles = useMemo(
    () => new Set(animations.filter(animation => animation.kind === 'HOTEL').map(animation => animation.tileId)),
    [animations],
  );
  const entries = useStableEntries(useMemo(() => buildTubeHouseEntries(tiles, hotelTiles), [tiles, hotelTiles]));

  const animationsRef = useRef<HouseAnimation[]>(animations);
  const entriesRef = useRef(entries);
  const tileIdsRef = useRef<number[]>([]);
  const elapsedRef = useRef(new Map<string, number>());
  const offsetsRef = useRef(new Map<number, number>());
  const dirtyRef = useRef(true);

  useEffect(() => () => disposeTubeHouseMeshes(meshes), [meshes]);

  const writeMatrices = useCallback(() => {
    const byTile = new Map(animationsRef.current.map(animation => [animation.tileId, animation]));
    writeTubeHouseMatrices(
      meshes,
      entriesRef.current,
      entry => {
        const animation = byTile.get(entry.tileId);
        return getHouseScale(entry, animation, animation ? elapsedRef.current.get(animation.id) ?? 0 : 0);
      },
      tileId => offsetsRef.current.get(tileId) ?? motionController?.getTileOffsetY(tileId) ?? 0,
    );
  }, [meshes, motionController]);

  useLayoutEffect(() => {
    animationsRef.current = animations;
    entriesRef.current = entries;
    tileIdsRef.current = [...new Set(entries.map(entry => entry.tileId))];
    // Forget clocks of animations that are gone; a new one starts at zero.
    const live = new Set(animations.map(animation => animation.id));
    for (const id of [...elapsedRef.current.keys()]) if (!live.has(id)) elapsedRef.current.delete(id);
    applyTubeHouseColors(meshes, entries);
    writeMatrices();
    dirtyRef.current = false;
    invalidate();
  }, [animations, entries, invalidate, meshes, writeMatrices]);

  useFrame((_, delta) => {
    const running = animationsRef.current;
    let moving = false;
    for (const animation of running) {
      const elapsed = elapsedRef.current.get(animation.id) ?? 0;
      if (elapsed < animation.durationMs) {
        elapsedRef.current.set(animation.id, elapsed + delta * 1000);
        moving = true;
      }
    }
    // A tile pressed by a token moves its houses with it.
    let pressed = false;
    for (const tileId of tileIdsRef.current) {
      const offset = motionController?.getTileOffsetY(tileId) ?? 0;
      if (offsetsRef.current.get(tileId) !== offset) {
        offsetsRef.current.set(tileId, offset);
        pressed = true;
      }
    }
    // One more write after the last tick, so the houses land on exactly their final scale.
    if (moving || pressed || dirtyRef.current) writeMatrices();
    dirtyRef.current = moving;
    if (moving || pressed) invalidate();
  });

  const puffs = animations.flatMap(animation => {
    if (animation.kind !== 'BUILD') return [];
    return animation.steps.flatMap(step => {
      const placement = getTubeHouseWorldPlacement(animation.tileId, step.houseIndex, animation.toHouses);
      const tile = tiles.find(candidate => candidate.tileId === animation.tileId);
      if (!placement) return [];
      return [(
        <group key={`${animation.id}:${step.houseIndex}`} position={placement.position} rotation={[0, placement.rotationY, 0]}>
          <ConstructionPuff
            delayMs={step.delayMs}
            durationMs={getScaledConstructionBurstDuration(step.durationMs, presentationTiming.housePop)}
            ownerColor={tile?.ownerColor}
          />
        </group>
      )];
    });
  });

  return (
    <group name="TubeHouseInstances">
      <primitive object={meshes.body} />
      <primitive object={meshes.trim} />
      <primitive object={meshes.roof} />
      {puffs}
    </group>
  );
}
