import type { OfficialPowerUpId, PowerUpCategory, PowerUpDefinition } from '@monopoly/shared';
import { publicAssetUrl } from '../events/cardVisuals';

// Presentation-only; server projections remain the authority for identity.
export const POWER_UP_FRONT_ART = {
  A01: 'fronts/A01', A02: 'fronts/A02', A03: 'fronts/A03', A04: 'fronts/A04', A05: 'fronts/A05',
  A06: 'fronts/A06', A07: 'fronts/A07', A08: 'fronts/A08', A09: 'fronts/A09', A10: 'fronts/A10',
  D01: 'fronts/D01', D02: 'fronts/D02', D03: 'fronts/D03', D04: 'fronts/D04', D05: 'fronts/D05',
  D06: 'fronts/D06', D07: 'fronts/D07', D08: 'fronts/D08', D09: 'fronts/D09', D10: 'fronts/D10',
  U01: 'fronts/U01', U02: 'fronts/U02', U03: 'fronts/U03', U04: 'fronts/U04', U05: 'fronts/U05',
  U06: 'fronts/U06', U07: 'fronts/U07', U08: 'fronts/U08', U09: 'fronts/U09', U10: 'fronts/U10',
} as const satisfies Record<OfficialPowerUpId, string>;
export const POWER_UP_BACK_ART = {
  ATTACK: 'backs/attack', DEFENSE: 'backs/defense', UTILITY: 'backs/utility',
} as const satisfies Record<PowerUpCategory, string>;
export const POWER_UP_RARITY_TREATMENTS = {
  COMMON: 'balanced', RARE: 'silver', EPIC: 'ornament', LEGENDARY: 'gilded',
} as const satisfies Record<PowerUpDefinition['rarity'], string>;

export function powerUpArtwork(category: PowerUpCategory, definitionId?: string) {
  const front = definitionId && Object.hasOwn(POWER_UP_FRONT_ART, definitionId)
    ? POWER_UP_FRONT_ART[definitionId as OfficialPowerUpId] : undefined;
  const relative = front ?? POWER_UP_BACK_ART[category];
  return {
    svg: publicAssetUrl('art/powerups/' + relative + '.svg'),
    png: publicAssetUrl('art/powerups/' + relative + '.png'),
    official: Boolean(front),
  };
}
