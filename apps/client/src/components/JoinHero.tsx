import type { CSSProperties } from 'react';
import { CHARACTER_IDS, type PlayerColorId } from '@monopoly/shared';
import { CHARACTER_REGISTRY } from '../game/characters/characterRegistry';
import { characterSvgDataUri } from '../game/characters/characterSvg';
import { getPropertyGroupDisplayColor } from '../game/ui/propertyVisualColors';
import './style/JoinHero.css';

/** One player color per mascot, in registry order, so the row reads like eight friends at the start line. */
const HERO_PLAYER_COLORS: readonly PlayerColorId[] = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'cyan'];
/** The eight districts of the board; each mascot stands on a tile of its own color. */
const HERO_DISTRICTS = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue'] as const;

const HERO_ROW = CHARACTER_IDS.map((characterId, index) => ({
  characterId,
  src: characterSvgDataUri(CHARACTER_REGISTRY[characterId].svgSource, HERO_PLAYER_COLORS[index % HERO_PLAYER_COLORS.length]),
  tileColor: getPropertyGroupDisplayColor(HERO_DISTRICTS[index % HERO_DISTRICTS.length], 'v2'),
}));

/**
 * The landing hero art (plan 04 OD-04-7): the eight mascots standing on a stylized mini board, composed from the same SVGs
 * as the lobby. It is decoration only. The images have empty alt text, carry no `title`, and the mascots are never named.
 */
export default function JoinHero() {
  return (
    <div className="join-hero" aria-hidden="true">
      <div className="join-hero__figures">
        {HERO_ROW.map((item, index) => (
          <div key={item.characterId} className="join-hero__figure" style={{ '--hero-index': index } as CSSProperties}>
            <img className="join-hero__mascot" src={item.src} alt="" draggable={false} />
          </div>
        ))}
      </div>
      <div className="join-hero__board">
        {HERO_ROW.map(item => (
          <span key={item.characterId} className="join-hero__tile" style={{ '--hero-tile': item.tileColor } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
