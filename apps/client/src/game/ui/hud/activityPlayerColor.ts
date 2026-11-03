import { PLAYER_COLOR_IDS } from '@monopoly/shared';
import { contrastRatio, mixHex } from '../../../design-system/tokens/contrast';
import { OTB_PALETTE } from '../../../design-system/tokens/palette';
import { getPlayerDisplayColor, isPlayerColorId } from '../playerVisualColors';

// Both supported Journal surfaces are light (legacy white and V2 paper). Keep the
// board hue, darkening only as much as needed for normal-sized text on either.
const textColors = new Map(PLAYER_COLOR_IDS.map(id => {
  const display = getPlayerDisplayColor(id);
  let color = display;
  for (let step = 1; contrastRatio(color, OTB_PALETTE['paper-50']) < 4.5 && step <= 100; step += 1) {
    color = mixHex(display, '#000000', 1 - step / 100);
  }
  return [id, color] as const;
}));

/** Unknown identities/colors stay ordinary text; never invent a player color. */
export function getActivityPlayerColor(rawColor: string | undefined): string | undefined {
  const normalized = rawColor?.toLowerCase();
  return isPlayerColorId(normalized) ? textColors.get(normalized) : undefined;
}
