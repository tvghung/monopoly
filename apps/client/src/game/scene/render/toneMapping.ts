import * as THREE from 'three';

/**
 * Khronos PBR Neutral is the scene tone mapper (plan 02 §8.3, decision OD-02-2): near-identity for base
 * colors below its compression knee, so the approved palette stays true and elements that opt out of
 * tone mapping (text, icons, sprites) sit next to lit surfaces without a visible seam.
 */
export const SCENE_TONE_MAPPING = THREE.NeutralToneMapping;
export const SCENE_TONE_MAPPING_EXPOSURE = 1;

const TONE_MAPPING_BY_NAME = {
  neutral: THREE.NeutralToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
} as const;

export type ToneMappingName = keyof typeof TONE_MAPPING_BY_NAME;

/**
 * Dev-only override for comparison captures (`?tonemap=aces|agx|neutral`); unknown values keep the
 * default. The scene only calls this on localhost or in the UAT harness.
 */
export function parseToneMappingOverride(search: string): THREE.ToneMapping {
  const name = new URLSearchParams(search).get('tonemap');
  return name !== null && Object.hasOwn(TONE_MAPPING_BY_NAME, name)
    ? TONE_MAPPING_BY_NAME[name as ToneMappingName]
    : SCENE_TONE_MAPPING;
}
