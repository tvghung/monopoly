import { INNER_SIDE_BOUNDARY } from '../boardLayout';
import {
  BOARD_FRAME_BEVEL,
  BOARD_FRAME_HEIGHT,
  BOARD_FRAME_WIDTH,
  CENTER_AIRPORT_SURFACE_Y,
} from '../architecture/boardArtSpec';
import { boardVisualTokens } from '../boardVisualTokens';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';

const CENTER_SIZE = INNER_SIDE_BOUNDARY * 2;
const RIM_EXTENT = CENTER_SIZE / 2 + BOARD_FRAME_WIDTH / 2;
const RAIL_Y = CENTER_AIRPORT_SURFACE_Y + 0.08 + BOARD_FRAME_HEIGHT / 2;

export interface BoardFrameSegment {
  name: string;
  width: number;
  depth: number;
  position: readonly [number, number, number];
}

export function getBoardFrameSegments(): readonly BoardFrameSegment[] {
  return [
    {
      name: 'InnerRimBottom',
      width: CENTER_SIZE + BOARD_FRAME_WIDTH * 2,
      depth: BOARD_FRAME_WIDTH,
      position: [0, RAIL_Y, -RIM_EXTENT],
    },
    {
      name: 'InnerRimTop',
      width: CENTER_SIZE + BOARD_FRAME_WIDTH * 2,
      depth: BOARD_FRAME_WIDTH,
      position: [0, RAIL_Y, RIM_EXTENT],
    },
    {
      name: 'InnerRimLeft',
      width: BOARD_FRAME_WIDTH,
      depth: CENTER_SIZE,
      position: [-RIM_EXTENT, RAIL_Y, 0],
    },
    {
      name: 'InnerRimRight',
      width: BOARD_FRAME_WIDTH,
      depth: CENTER_SIZE,
      position: [RIM_EXTENT, RAIL_Y, 0],
    },
  ];
}

export default function BoardFrame() {
  return (
    <group name="BoardFrame">
      {getBoardFrameSegments().map(segment => (
        <RoundedBoxMesh
          key={segment.name}
          name={segment.name}
          width={segment.width}
          height={BOARD_FRAME_HEIGHT}
          depth={segment.depth}
          radius={BOARD_FRAME_BEVEL}
          color={boardVisualTokens.boardFrame}
          materialProfile="centerWell"
          position={segment.position}
        />
      ))}
    </group>
  );
}
