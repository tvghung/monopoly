import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SCENE_TONE_MAPPING, SCENE_TONE_MAPPING_EXPOSURE, parseToneMappingOverride } from './toneMapping';

describe('scene tone mapping', () => {
  it('is Khronos PBR Neutral at exposure 1 by default', () => {
    expect(SCENE_TONE_MAPPING).toBe(THREE.NeutralToneMapping);
    expect(SCENE_TONE_MAPPING_EXPOSURE).toBe(1);
    expect(parseToneMappingOverride('')).toBe(THREE.NeutralToneMapping);
  });

  it('accepts the comparison overrides used for evidence captures', () => {
    expect(parseToneMappingOverride('?tonemap=aces')).toBe(THREE.ACESFilmicToneMapping);
    expect(parseToneMappingOverride('?tonemap=agx')).toBe(THREE.AgXToneMapping);
    expect(parseToneMappingOverride('?tonemap=neutral')).toBe(THREE.NeutralToneMapping);
  });

  it('ignores unknown and inherited names', () => {
    for (const search of ['?tonemap=filmic', '?tonemap=', '?tonemap=toString', '?tonemap=__proto__']) {
      expect(parseToneMappingOverride(search)).toBe(THREE.NeutralToneMapping);
    }
  });
});
