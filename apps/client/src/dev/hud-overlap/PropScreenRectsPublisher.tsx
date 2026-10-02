import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useRenderQuality } from '../../game/scene/render/RenderQualityContext';
import { TABLE_PROP_PLACEMENTS, getTablePropScreenRect, isTablePropVisible } from '../../game/scene/props/tablePropLayout';

/**
 * Dev and UAT only (mounted next to `TileScreenRectsPublisher`): publishes where the four table props are on the page, and
 * whether each is shown, so the capture tool can check that no HUD region covers a prop and no prop covers a tile (plan 05
 * T05.8, with the overlap checker of plan 03). It uses the same layout code the props are drawn with.
 */
export default function PropScreenRectsPublisher() {
  const gl = useThree(state => state.gl);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const { tier } = useRenderQuality();

  useEffect(() => {
    const publish = () => {
      const rect = gl.domElement.getBoundingClientRect();
      const left = rect.left + window.scrollX;
      const top = rect.top + window.scrollY;
      window.__OWN_THE_BLOCK_PROP_SCREEN_RECTS__ = {
        canvas: { left, top, width: rect.width, height: rect.height },
        props: TABLE_PROP_PLACEMENTS.map(placement => {
          const local = getTablePropScreenRect(placement, { width, height });
          return {
            id: placement.id,
            visible: tier !== 'low' && isTablePropVisible(placement, { width, height }),
            rect: { left: left + local.left, top: top + local.top, right: left + local.right, bottom: top + local.bottom },
          };
        }),
      };
    };
    const frame = window.requestAnimationFrame(publish);
    return () => window.cancelAnimationFrame(frame);
  }, [gl, height, tier, width]);

  useEffect(() => () => { delete window.__OWN_THE_BLOCK_PROP_SCREEN_RECTS__; }, []);

  return null;
}
