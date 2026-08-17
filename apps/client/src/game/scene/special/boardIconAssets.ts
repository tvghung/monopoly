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
    safeHeightRatio: 0.66,
    backingColor: '#2d4658',
  },
  'handcuffs-svg': {
    kind: 'handcuffs-svg',
    url: handcuffsUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.86,
    safeHeightRatio: 0.7,
    cornerSafeWidthRatio: 0.8,
    cornerSafeHeightRatio: 0.78,
    backingColor: '#080808',
  },
  'water-faucet-svg': {
    kind: 'water-faucet-svg',
    url: waterFaucetUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.86,
    safeHeightRatio: 0.7,
    backingColor: '#566269',
  },
  'electric-bulb-svg': {
    kind: 'electric-bulb-svg',
    url: electricBulbUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.84,
    safeHeightRatio: 0.7,
    backingColor: '#9b7b00',
  },
  'chance-question-svg': {
    kind: 'chance-question-svg',
    url: chanceQuestionUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.72,
    safeHeightRatio: 0.72,
    cornerSafeWidthRatio: 0.58,
    cornerSafeHeightRatio: 0.68,
    backingColor: '#b43d4c',
  },
  'fortune-wheel-svg': {
    kind: 'fortune-wheel-svg',
    url: fortuneWheelUrl,
    viewBoxWidth: 512,
    viewBoxHeight: 512,
    safeWidthRatio: 0.72,
    safeHeightRatio: 0.72,
    cornerSafeWidthRatio: 0.58,
    cornerSafeHeightRatio: 0.58,
    backingColor: '#755737',
  },
};
