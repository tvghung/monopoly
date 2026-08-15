import {
  INNER_SIDE_BOUNDARY,
  OUTER_BOARD_SIZE,
  PLATFORM_HEIGHT,
} from './boardLayout';
import { boardVisualTokens } from './boardVisualTokens';
import BoardCenterDecoration from './BoardCenterDecoration';

const CENTER_SIZE = INNER_SIDE_BOUNDARY * 2;
const RIM_HEIGHT = 0.12;
const RIM_WIDTH = 0.16;

export default function BoardBase() {
  const rimExtent = CENTER_SIZE / 2 + RIM_WIDTH / 2;
  return (
    <group>
      <mesh position={[0, PLATFORM_HEIGHT / 2, 0]}>
        <boxGeometry args={[OUTER_BOARD_SIZE + 0.72, PLATFORM_HEIGHT, OUTER_BOARD_SIZE + 0.72]} />
        <meshStandardMaterial color={boardVisualTokens.boardBase} roughness={0.78} />
      </mesh>
      <mesh position={[0, PLATFORM_HEIGHT + 0.025, 0]}>
        <boxGeometry args={[CENTER_SIZE, 0.08, CENTER_SIZE]} />
        <meshStandardMaterial color={boardVisualTokens.boardCenter} roughness={0.82} />
      </mesh>
      <mesh position={[0, PLATFORM_HEIGHT + RIM_HEIGHT / 2, -rimExtent]}>
        <boxGeometry args={[CENTER_SIZE + RIM_WIDTH * 2, RIM_HEIGHT, RIM_WIDTH]} />
        <meshStandardMaterial color={boardVisualTokens.boardBaseEdge} roughness={0.8} />
      </mesh>
      <mesh position={[0, PLATFORM_HEIGHT + RIM_HEIGHT / 2, rimExtent]}>
        <boxGeometry args={[CENTER_SIZE + RIM_WIDTH * 2, RIM_HEIGHT, RIM_WIDTH]} />
        <meshStandardMaterial color={boardVisualTokens.boardBaseEdge} roughness={0.8} />
      </mesh>
      <mesh position={[-rimExtent, PLATFORM_HEIGHT + RIM_HEIGHT / 2, 0]}>
        <boxGeometry args={[RIM_WIDTH, RIM_HEIGHT, CENTER_SIZE]} />
        <meshStandardMaterial color={boardVisualTokens.boardBaseEdge} roughness={0.8} />
      </mesh>
      <mesh position={[rimExtent, PLATFORM_HEIGHT + RIM_HEIGHT / 2, 0]}>
        <boxGeometry args={[RIM_WIDTH, RIM_HEIGHT, CENTER_SIZE]} />
        <meshStandardMaterial color={boardVisualTokens.boardBaseEdge} roughness={0.8} />
      </mesh>
      <BoardCenterDecoration />
    </group>
  );
}
