import {
  BrickWall,
  Building2,
  Coins,
  CircleHelp,
  Flag,
  Gem,
  Gift,
  Lightbulb,
  Lock,
  Moon,
  ParkingSquare,
  Receipt,
  ShoppingBag,
  Siren,
  Store,
  TrainFront,
  Trees,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { PropertyMotif } from '../../game/ui/propertyVisualColors';

/**
 * Decorative glyphs for deed cards (plan 04 §8.2). A district motif stands in for the landmark art slot until plan 05
 * supplies the 2D art; the special tiles use flat glyphs from the same icon set instead of new SVG assets.
 */
export const MOTIF_GLYPHS = {
  brick: BrickWall,
  water: Waves,
  shopping: ShoppingBag,
  market: Store,
  downtown: Building2,
  nightlife: Moon,
  eco: Trees,
  luxury: Gem,
  rail: TrainFront,
  utility: Zap,
} as const satisfies Record<PropertyMotif, LucideIcon>;

export const SPECIAL_TILE_GLYPHS: Readonly<Record<string, LucideIcon>> = {
  start: Flag,
  chest: Gift,
  chance: CircleHelp,
  jail: Lock,
  gojail: Siren,
  parking: ParkingSquare,
  expense: Receipt,
};

/** Fallback when a tile type has no glyph. */
export const DEFAULT_TILE_GLYPH: LucideIcon = Coins;

export const COMPANY_GLYPHS: readonly LucideIcon[] = [Lightbulb, Zap];
