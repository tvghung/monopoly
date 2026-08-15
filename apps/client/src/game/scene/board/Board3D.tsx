import { tileState } from '@monopoly/shared';
import { boardLayout } from './boardLayout';
import BoardBase from './BoardBase';
import BoardTile3D from './BoardTile3D';

export default function Board3D() {
  return (
    <group>
      <BoardBase />
      {boardLayout.map(layout => (
        <BoardTile3D key={layout.tileId} tileId={layout.tileId} tile={tileState[layout.tileId]} />
      ))}
    </group>
  );
}
