import railroadTrainUrl from './icons/railroad-train.svg?url';
import handcuffsUrl from './icons/handcuffs.svg?url';
import waterFaucetUrl from './icons/water-faucet.svg?url';
import electricBulbUrl from './icons/electric-bulb.svg?url';
import chanceQuestionUrl from './icons/chance-question.svg?url';
import fortuneWheelUrl from './icons/fortune-wheel.svg?url';

export type BoardSvgTileIconKind =
  | 'railroad-train-svg'
  | 'handcuffs-svg'
  | 'water-faucet-svg'
  | 'electric-bulb-svg'
  | 'chance-question-svg'
  | 'fortune-wheel-svg';

export interface BoardSvgTileIconAsset {
  kind: BoardSvgTileIconKind;
  url: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  safeWidthRatio: number;
  safeHeightRatio: number;
  /** Normalized offset toward the upper/footer divider; negative moves outward. */
  verticalBias: number;
  cornerSafeWidthRatio?: number;
  cornerSafeHeightRatio?: number;
  backingColor: string;
}

export const BOARD_SVG_TILE_ICON_ASSETS: Record<BoardSvgTileIconKind, BoardSvgTileIconAsset> = {
  'railroad-train-svg': {
    kind: 'railroad-train-svg',
    url: railroadTrainUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.86,
    safeHeightRatio: 0.72,
    verticalBias: 0,
    backingColor: '#2d4658',
  },
  'handcuffs-svg': {
    kind: 'handcuffs-svg',
    url: handcuffsUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.86,
    safeHeightRatio: 0.7,
    verticalBias: 0,
    cornerSafeWidthRatio: 0.89,
    cornerSafeHeightRatio: 0.82,
    backingColor: '#080808',
  },
  'water-faucet-svg': {
    kind: 'water-faucet-svg',
    url: waterFaucetUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.86,
    safeHeightRatio: 0.7,
    verticalBias: 0.02,
    backingColor: '#566269',
  },
  'electric-bulb-svg': {
    kind: 'electric-bulb-svg',
    url: electricBulbUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.84,
    safeHeightRatio: 0.7,
    verticalBias: 0,
    backingColor: '#9b7b00',
  },
  'chance-question-svg': {
    kind: 'chance-question-svg',
    url: chanceQuestionUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.78,
    safeHeightRatio: 0.78,
    verticalBias: 0.025,
    cornerSafeWidthRatio: 0.64,
    cornerSafeHeightRatio: 0.68,
    backingColor: '#b43d4c',
  },
  'fortune-wheel-svg': {
    kind: 'fortune-wheel-svg',
    url: fortuneWheelUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.78,
    safeHeightRatio: 0.78,
    verticalBias: 0.025,
    cornerSafeWidthRatio: 0.64,
    cornerSafeHeightRatio: 0.64,
    backingColor: '#755737',
  },
};
