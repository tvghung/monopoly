import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { boardVisualTokens } from '../../../game/scene/board/boardVisualTokens';
import { CAMERA_DIRECTION } from '../../../game/scene/camera/cameraMath';
import { kitOpaqueMaterial } from '../../../game/scene/buildings/kit/kitMaterials';
import { LandmarkBody } from '../../../game/scene/buildings/LandmarkMesh';
import { TABLE_PROP_BUILDERS } from '../../../game/scene/props/tablePropGeometry';
import { TABLE_PROP_PLACEMENTS } from '../../../game/scene/props/tablePropLayout';
import { LANDMARK_PLAN, LANDMARKS } from '../../../game/scene/buildings/landmarks/registry';
import { PLINTH } from '../../../game/scene/buildings/landmarks/limits';
import { TUBE_HOUSE } from '../../../game/scene/buildings/tubeHouseGeometry';
import {
  applyTubeHouseColors,
  createTubeHouseMeshes,
  disposeTubeHouseMeshes,
  writeTubeHouseMatrices,
  type TubeHouseEntry,
} from '../../../game/scene/buildings/tubeHouseMeshes';
import SceneLightRig from '../../../game/scene/render/lighting/SceneLightRig';
import StudioEnvironment from '../../../game/scene/render/environment/StudioEnvironment';
import OptionalSceneLayer from '../../../game/scene/render/OptionalSceneLayer';
import { SCENE_TONE_MAPPING, SCENE_TONE_MAPPING_EXPOSURE } from '../../../game/scene/render/toneMapping';
import { OTB_PALETTE } from '../../../design-system/tokens/palette';
import { getCharacterDefinition } from '../../../game/characters/characterRegistry';
import { acquireCharacterTexture } from '../../../game/characters/characterTextureCache';
import CharacterStandee from '../../../game/scene/characters/CharacterStandee';
import StandeeBases from '../../../game/scene/characters/StandeeBases';
import { STANDEE_HEADING_Y } from '../../../game/scene/characters/standeeMaterial';
import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import { LabSection } from '../labKit';
import './LandmarksSection.css';

const OWNERS = ['red', 'blue', 'green', 'yellow'] as const;
const SPACING = 1.9;
/** The camera's right axis on the ground: items placed along it line up horizontally on screen. */
const ROW_AXIS = [Math.SQRT1_2, 0, -Math.SQRT1_2] as const;
const alongRow = (distance: number): [number, number, number] => [ROW_AXIS[0] * distance, 0, ROW_AXIS[2] * distance];

/** `&landmark=1,3,6` shows just those landmarks large (with the houses beside them); without it the whole row is shown. */
function readFocusedTiles(): number[] | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('landmark');
  if (!raw) return null;
  const wanted = raw.split(',').map(Number).filter(value => LANDMARKS.some(landmark => landmark.tileId === value));
  return wanted.length > 0 ? wanted : null;
}

/** `&props=1` shows the four table props (plan 05 T05.8) in a row instead of the landmarks. */
function readPropsMode(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('props');
}

/** The four table props, built exactly as the board builds them, one per column. */
function PropsRow({ distance }: { distance: number }) {
  const built = useMemo(() => TABLE_PROP_PLACEMENTS.map(placement => ({ placement, prop: TABLE_PROP_BUILDERS[placement.id]() })), []);
  useEffect(() => () => built.forEach(({ prop }) => prop.geometry.dispose()), [built]);
  return (
    <>
      {built.map(({ placement, prop }, index) => (
        <mesh
          key={placement.id}
          name={`TableProp:${placement.id}`}
          geometry={prop.geometry}
          material={kitOpaqueMaterial}
          position={alongRow(distance + index * SPACING)}
          rotation={[0, placement.yaw, 0]}
          castShadow
          receiveShadow
          dispose={null}
        />
      ))}
    </>
  );
}

function configureSheetCamera(camera: THREE.OrthographicCamera, width: number, height: number, columns: number, tallest: number): void {
  const distance = 24;
  camera.position.set(CAMERA_DIRECTION[0] * distance, CAMERA_DIRECTION[1] * distance, CAMERA_DIRECTION[2] * distance);
  // Wide enough for the whole row, and tall enough for the tallest landmark (a foot print of about 2 on screen plus its height).
  const byWidth = width / (SPACING * (columns + 0.4));
  const byHeight = height / (tallest * 0.75 + 1.3);
  camera.zoom = Math.max(40, Math.min(byWidth, byHeight));
  camera.lookAt(0, tallest * 0.3, 0);
  camera.updateProjectionMatrix();
}

/** The board's camera direction and orthographic projection, with the zoom chosen so the whole row fits the canvas. */
function SheetCamera({ columns, tallest }: { columns: number; tallest: number }) {
  const camera = useThree(state => state.camera);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    configureSheetCamera(camera, width, height, columns, tallest);
    invalidate();
  }, [camera, columns, height, invalidate, tallest, width]);
  return null;
}

/** Without WebGL (a test environment) the sheet is a note instead of a canvas. */
const HAS_WEBGL = typeof WebGL2RenderingContext !== 'undefined' || typeof WebGLRenderingContext !== 'undefined';

/** Three houses of a full row, as a scale reference next to the landmarks (the real instanced meshes). */
function HouseScaleReference({ distance }: { distance: number }) {
  const meshes = useMemo(() => createTubeHouseMeshes(), []);
  useEffect(() => {
    const entries: TubeHouseEntry[] = [0, 1, 2].map(slot => ({
      key: `ref:${slot}`,
      tileId: 6,
      slot,
      count: 3,
      ownerColor: OWNERS[slot],
      facadeColor: ['#BFE8D6', '#F6E3A1', '#F4B6A0'][slot],
      position: alongRow(distance + (slot - 1) * (TUBE_HOUSE.width + TUBE_HOUSE.gap)),
      rotationY: 0,
    }));
    applyTubeHouseColors(meshes, entries);
    writeTubeHouseMatrices(meshes, entries, () => 1, () => 0);
  }, [meshes, distance]);
  useEffect(() => () => disposeTubeHouseMeshes(meshes), [meshes]);
  return (
    <>
      <primitive object={meshes.body} />
      <primitive object={meshes.trim} />
      <primitive object={meshes.roof} />
    </>
  );
}

const STANDEES: ReadonlyArray<readonly [CharacterId, PlayerColorId]> = [
  ['dog', 'red'], ['panda', 'blue'], ['cat', 'green'], ['penguin', 'yellow'],
];

/** One mascot standee in the board's own component, so the die-cut border and the base are judged where they are drawn. */
function StandeePreview({ characterId, color, distance }: { characterId: CharacterId; color: PlayerColorId; distance: number }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => acquireCharacterTexture(characterId, color, next => { setTexture(next); invalidate(); }), [characterId, color, invalidate]);
  return (
    <group position={alongRow(distance)} rotation={[0, STANDEE_HEADING_Y, 0]}>
      <CharacterStandee texture={texture} definition={getCharacterDefinition(characterId)} playerColor={color} />
    </group>
  );
}

/**
 * Plan 05 style sheet: the built landmarks on their plinths in the board's camera and light, next to three tube houses for
 * scale. This is the picture the pilot review (gate G5a) is held on, at a size the board never shows them.
 */
export default function LandmarksSection() {
  const propsMode = readPropsMode();
  const focused = readFocusedTiles();
  const shown = propsMode ? [] : focused === null ? LANDMARKS : LANDMARKS.filter(landmark => focused.includes(landmark.tileId));
  const columns = propsMode ? TABLE_PROP_PLACEMENTS.length + 1 : shown.length + 1 + (focused === null ? 2 : 0);
  const left = -((columns - 1) * SPACING) / 2;
  return (
    <LabSection
      id="landmarks"
      title="Landmarks (plan 05)"
      note={`${LANDMARKS.length} of ${LANDMARK_PLAN.length} landmarks built. Owner colors rotate; the three houses on the left show the scale. Add &landmark=<tile id> for one large, or &props=1 for the four table props.`}
    >
      <div className="lab-landmark-sheet" data-design-lab-ready="true">
        {HAS_WEBGL ? <Canvas
          orthographic
          dpr={[1, 1.5]}
          shadows="percentage"
          frameloop="demand"
          camera={{ near: 0.1, far: 100, position: [10, 12, 10] }}
          gl={{ antialias: true, alpha: false, toneMapping: SCENE_TONE_MAPPING, toneMappingExposure: SCENE_TONE_MAPPING_EXPOSURE }}
        >
          <color attach="background" args={[boardVisualTokens.sceneBackground]} />
          <SheetCamera columns={columns} tallest={Math.max(0.9, ...shown.map(landmark => landmark.maxHeight))} />
          <SceneLightRig />
          <OptionalSceneLayer name="studio-environment">
            <StudioEnvironment />
          </OptionalSceneLayer>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, (propsMode ? 0 : -PLINTH.height) - 0.002, 0]} receiveShadow>
            <planeGeometry args={[120, 120]} />
            <meshStandardMaterial color={OTB_PALETTE['table-oak']} roughness={0.8} />
          </mesh>
          <HouseScaleReference distance={left} />
          <StandeeBases />
          {propsMode ? <PropsRow distance={left + SPACING} /> : null}
          {focused === null && !propsMode
            ? STANDEES.map(([characterId, color], index) => (
              <StandeePreview
                key={characterId}
                characterId={characterId}
                color={color}
                distance={left + (shown.length + 1) * SPACING + index * 0.62}
              />
            ))
            : null}
          {shown.map((landmark, index) => (
            <group key={landmark.tileId} position={alongRow(left + (index + 1) * SPACING)}>
              <LandmarkBody castShadow tileId={landmark.tileId} ownerColor={OWNERS[(focused === null ? index : LANDMARKS.indexOf(landmark)) % OWNERS.length]} />
            </group>
          ))}
        </Canvas> : <p className="lab-section__note">The landmark sheet needs WebGL.</p>}
      </div>
    </LabSection>
  );
}
