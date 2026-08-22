import type { CardDeck, DeckCounts } from '@monopoly/shared';
import type { CardPresentationSignal } from '../../presentation/store/types';
import { CENTER_AIRPORT_FIELD_TOP_Y } from '../board/architecture/boardArtSpec';
import {
  CENTER_ORTHOGONAL_PATH_SEGMENTS,
  getCenterPathBounds,
} from '../board/center/centerFieldPathLayout';
import { CAMERA_DIRECTION } from '../camera/cameraMath';
import { getDiceArenaBounds, type DiceArenaBounds } from '../dice/diceLayout';
import { BANK_WORLD_ANCHOR } from '../stations/stationWorld';

export const PHYSICAL_CARD_WIDTH = 1.76;
export const PHYSICAL_CARD_DEPTH = 1.1;
export const PHYSICAL_CARD_THICKNESS = 0.046;
export const PHYSICAL_CARD_LAYER_GAP = 0.008;
export const PHYSICAL_CARD_LAYER_STEP = PHYSICAL_CARD_THICKNESS + PHYSICAL_CARD_LAYER_GAP;
export const PHYSICAL_CARD_BEVEL = 0.022;
export const CARD_PRESENTATION_SCALE = 2.65;
export const CARD_REVEAL_ROTATIONS = 2.5;

export const DECK_ANCHORS: Record<CardDeck, readonly [number, number]> = {
  chance: [-3.2, 1.55],
  chest: [3.2, 1.55],
};

export const DECK_BASE_CENTER_Y = CENTER_AIRPORT_FIELD_TOP_Y
  + PHYSICAL_CARD_THICKNESS / 2
  + 0.02;

export const CARD_PRESENTATION_POSITION: readonly [number, number, number] = [
  CAMERA_DIRECTION[0] * 3.4,
  CAMERA_DIRECTION[1] * 3.4,
  CAMERA_DIRECTION[2] * 3.4,
];

export const CARD_FOCUS_SCRIM_POSITION: readonly [number, number, number] = [
  CAMERA_DIRECTION[0] * 1.15,
  CAMERA_DIRECTION[1] * 1.15,
  CAMERA_DIRECTION[2] * 1.15,
];

export interface CardLayerTransform {
  position: readonly [number, number, number];
  rotationY: number;
}

export function getCardLayerTransform(deck: CardDeck, index: number): CardLayerTransform {
  const safeIndex = Math.max(0, Math.floor(index));
  const anchor = DECK_ANCHORS[deck];
  const xOffset = ((safeIndex * 7) % 5 - 2) * 0.006;
  const zOffset = ((safeIndex * 11) % 5 - 2) * 0.005;
  return {
    position: [
      anchor[0] + xOffset,
      DECK_BASE_CENTER_Y + safeIndex * PHYSICAL_CARD_LAYER_STEP,
      anchor[1] + zOffset,
    ],
    rotationY: ((safeIndex * 13) % 7 - 3) * 0.004,
  };
}

export function getIdleDeckCardCount(
  deck: CardDeck,
  deckCounts: DeckCounts,
  signal: CardPresentationSignal | null,
): number {
  const authoritativeCount = Math.max(0, Math.floor(deckCounts[deck]));
  const detachedBeforeAuthoritativeDraw = signal?.deck === deck
    && (signal.stage === 'DRAWING' || signal.stage === 'AWAITING_DRAW');
  return Math.max(0, authoritativeCount - (detachedBeforeAuthoritativeDraw ? 1 : 0));
}

export function getDeckFootprintBounds(deck: CardDeck): DiceArenaBounds {
  const anchor = DECK_ANCHORS[deck];
  const offsetAllowance = 0.025;
  return {
    minX: anchor[0] - PHYSICAL_CARD_WIDTH / 2 - offsetAllowance,
    minZ: anchor[1] - PHYSICAL_CARD_DEPTH / 2 - offsetAllowance,
    maxX: anchor[0] + PHYSICAL_CARD_WIDTH / 2 + offsetAllowance,
    maxZ: anchor[1] + PHYSICAL_CARD_DEPTH / 2 + offsetAllowance,
  };
}

export function getBankFootprintBounds(): DiceArenaBounds {
  return {
    minX: BANK_WORLD_ANCHOR[0] - 2.15 / 2,
    minZ: BANK_WORLD_ANCHOR[2] - 1.02 / 2,
    maxX: BANK_WORLD_ANCHOR[0] + 2.15 / 2,
    maxZ: BANK_WORLD_ANCHOR[2] + 1.02 / 2,
  };
}

export function boundsOverlap(left: DiceArenaBounds, right: DiceArenaBounds): boolean {
  return left.minX <= right.maxX
    && left.maxX >= right.minX
    && left.minZ <= right.maxZ
    && left.maxZ >= right.minZ;
}

export function isCenterAssetLayoutClear(): boolean {
  const assets = [getDeckFootprintBounds('chance'), getDeckFootprintBounds('chest'), getBankFootprintBounds()];
  const paths = CENTER_ORTHOGONAL_PATH_SEGMENTS.map(segment => {
    const [minX, minZ, maxX, maxZ] = getCenterPathBounds(segment);
    return { minX, minZ, maxX, maxZ };
  });
  return assets.every((asset, index) => (
    !boundsOverlap(asset, getDiceArenaBounds())
    && paths.every(path => !boundsOverlap(asset, path))
    && assets.every((other, otherIndex) => index === otherIndex || !boundsOverlap(asset, other))
  ));
}
