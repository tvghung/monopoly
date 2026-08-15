import { INNER_SIDE_BOUNDARY } from '../boardLayout';
import {
  BOARD_FRAME_BEVEL,
  BOARD_FRAME_HEIGHT,
  BOARD_FRAME_WIDTH,
  BOARD_FOUNDATION_HEIGHT,
} from '../architecture/boardArtSpec';
import { boardVisualTokens } from '../boardVisualTokens';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';

const CENTER_SIZE = INNER_SIDE_BOUNDARY * 2;
const RIM_EXTENT = CENTER_SIZE / 2 + BOARD_FRAME_WIDTH / 2;

export default function BoardFrame() {
  const railY = BOARD_FOUNDATION_HEIGHT + BOARD_FRAME_HEIGHT / 2 - 0.02;
  return (
    <group name="BoardFrame">
      <RoundedBoxMesh
        name="InnerRimBottom"
        width={CENTER_SIZE + BOARD_FRAME_WIDTH * 2}
        height={BOARD_FRAME_HEIGHT}
        depth={BOARD_FRAME_WIDTH}
        radius={BOARD_FRAME_BEVEL}
        color={boardVisualTokens.boardFrame}
        materialProfile="boardEdge"
        position={[0, railY, -RIM_EXTENT]}
      />
      <RoundedBoxMesh
        name="InnerRimTop"
        width={CENTER_SIZE + BOARD_FRAME_WIDTH * 2}
        height={BOARD_FRAME_HEIGHT}
        depth={BOARD_FRAME_WIDTH}
        radius={BOARD_FRAME_BEVEL}
        color={boardVisualTokens.boardFrame}
        materialProfile="boardEdge"
        position={[0, railY, RIM_EXTENT]}
      />
      <RoundedBoxMesh
        name="InnerRimLeft"
        width={BOARD_FRAME_WIDTH}
        height={BOARD_FRAME_HEIGHT}
        depth={CENTER_SIZE}
        radius={BOARD_FRAME_BEVEL}
        color={boardVisualTokens.boardFrame}
        materialProfile="boardEdge"
        position={[-RIM_EXTENT, railY, 0]}
      />
      <RoundedBoxMesh
        name="InnerRimRight"
        width={BOARD_FRAME_WIDTH}
        height={BOARD_FRAME_HEIGHT}
        depth={CENTER_SIZE}
        radius={BOARD_FRAME_BEVEL}
        color={boardVisualTokens.boardFrame}
        materialProfile="boardEdge"
        position={[RIM_EXTENT, railY, 0]}
      />
    </group>
  );
}
