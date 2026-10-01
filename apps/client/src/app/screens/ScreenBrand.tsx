import type { CSSProperties } from 'react';
import { CHARACTER_IDS, type PlayerColorId } from '@monopoly/shared';
import { CHARACTER_REGISTRY } from '../../game/characters/characterRegistry';
import { characterSvgDataUri } from '../../game/characters/characterSvg';

/** One player color per mascot, in registry order, so the row reads like eight friends waiting at the start line. */
const ROW_COLORS: readonly PlayerColorId[] = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'cyan'];

const MASCOT_ROW = CHARACTER_IDS.map((characterId, index) => ({
  characterId,
  src: characterSvgDataUri(CHARACTER_REGISTRY[characterId].svgSource, ROW_COLORS[index % ROW_COLORS.length]),
}));

/** The game's name as a lockup: the tagline above the product name. Decorative eyebrow; the product name is real text. */
export function BrandLockup() {
  return (
    <div className="app-screen__brand">
      <p className="app-screen__brand-mark" aria-hidden="true">OWN THE BLOCK</p>
      <p className="app-screen__product-name">Cờ Tỷ Phú Việt Nam</p>
    </div>
  );
}

/** Eight mascots in a row. Decoration only: empty alt text, no title, and no mascot is ever named. */
export function MascotRow() {
  return (
    <div className="app-screen__mascots" aria-hidden="true">
      {MASCOT_ROW.map((item, index) => (
        <img
          key={item.characterId}
          className="app-screen__mascot"
          src={item.src}
          alt=""
          draggable={false}
          style={{ '--mascot-index': index } as CSSProperties}
        />
      ))}
    </div>
  );
}
