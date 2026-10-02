import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { kitOpaqueMaterial } from '../buildings/kit/kitMaterials';
import { useRenderQuality } from '../render/RenderQualityContext';
import { TABLE_PROP_BUILDERS, type TablePropGeometry, type TablePropId } from './tablePropGeometry';
import { TABLE_PROP_PLACEMENTS, getTablePropPosition, getVisibleTableProps } from './tablePropLayout';

/**
 * The table props (plan 05 §8.6): a cà phê phin, a nón lá, a bát sen and a stack of play money on the oak beside the board.
 * They are cosmetic: one draw each with the shared kit material, cast a shadow wherever the tier has shadows, are left out of
 * the `low` tier, and are hidden at any canvas size where the table margin is too small (never moved under the HUD). The
 * semantic source of truth of the game is the DOM, so props carry no accessible name.
 */
export default function TableProps() {
  const { tier, shadows } = useRenderQuality();
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const built = useMemo((): ReadonlyMap<TablePropId, TablePropGeometry> | null => (tier === 'low'
    ? null
    : new Map(TABLE_PROP_PLACEMENTS.map(placement => [placement.id, TABLE_PROP_BUILDERS[placement.id]()] as const))), [tier]);
  useEffect(() => () => built?.forEach(prop => prop.geometry.dispose()), [built]);

  if (!built) return null;
  return (
    <group name="TableProps">
      {getVisibleTableProps({ width, height }).map(placement => {
        const prop = built.get(placement.id);
        if (!prop) return null;
        return (
          <mesh
            key={placement.id}
            name={`TableProp:${placement.id}`}
            geometry={prop.geometry}
            material={kitOpaqueMaterial}
            position={getTablePropPosition(placement)}
            rotation={[0, placement.yaw, 0]}
            castShadow={shadows.enabled}
            receiveShadow
            dispose={null}
          />
        );
      })}
    </group>
  );
}
