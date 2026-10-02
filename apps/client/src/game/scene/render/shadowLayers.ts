/**
 * Objects on this layer are drawn by the key light's shadow camera but not by the main camera. The landmark shadow proxy
 * (plan 05 §8.8) lives here, so its triangles cost the shadow pass only and the main pass never draws an invisible mesh.
 */
export const SHADOW_ONLY_LAYER = 1;
