import { useRenderQuality } from '../RenderQualityContext';
import { LIGHT_RIG } from './lightRigSpec';

/**
 * Key, fill and rim lights of the toy-on-a-table look (plan 02 §8.2). Only the key light ever casts
 * shadows, and only in tiers that have them; the fill is a hemisphere that bounces the oak table color.
 */
export default function SceneLightRig() {
  const { shadows } = useRenderQuality();
  const { key, fill, rim } = LIGHT_RIG;
  return (
    <>
      <hemisphereLight name="FillLight" args={[fill.skyColor, fill.groundColor, fill.intensity]} />
      <directionalLight
        name="KeyLight"
        position={[...key.position]}
        color={key.color}
        intensity={key.intensity}
        castShadow={shadows.enabled}
        shadow-mapSize={[shadows.mapSize, shadows.mapSize]}
        shadow-camera-left={-key.shadow.halfExtent}
        shadow-camera-right={key.shadow.halfExtent}
        shadow-camera-top={key.shadow.halfExtent}
        shadow-camera-bottom={-key.shadow.halfExtent}
        shadow-camera-near={key.shadow.near}
        shadow-camera-far={key.shadow.far}
        shadow-bias={key.shadow.bias}
        shadow-normalBias={key.shadow.normalBias}
        shadow-radius={key.shadow.radius}
      />
      <directionalLight name="RimLight" position={[...rim.position]} color={rim.color} intensity={rim.intensity} />
    </>
  );
}
