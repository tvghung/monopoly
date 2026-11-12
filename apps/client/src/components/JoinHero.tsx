import {
  useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent,
} from 'react';
import { CHARACTER_IDS, type PlayerColorId } from '@monopoly/shared';
import { CHARACTER_REGISTRY } from '../game/characters/characterRegistry';
import { characterSvgDataUri } from '../game/characters/characterSvg';
import { getPropertyGroupDisplayColor } from '../game/ui/propertyVisualColors';
import MascotSparkles, { MASCOT_SPARKLE_LIFETIME_MS } from './mascot/MascotSparkles';
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

/** How long a tap reaction lives before its markup is removed (the CSS jump and the sparkles end before this). */
export const HERO_REACTION_MS = MASCOT_SPARKLE_LIFETIME_MS;

interface HeroReaction {
  index: number;
  key: number;
}

/**
 * The landing hero art (plan 04 OD-04-7): the eight mascots standing on a stylized mini board, composed from the same SVGs
 * as the lobby. It is decoration only. The images have empty alt text, carry no `title`, and the mascots are never named.
 *
 * It answers a tap without being a control: a tapped mascot jumps once and throws a few coins. Hovering and moving the mouse
 * do nothing (no hover rise, no lean toward the pointer). None of it is focusable or announced, nothing loops, and every
 * movement is behind the reduced-motion guard in `JoinHero.css`.
 */
export default function JoinHero() {
  const [reactions, setReactions] = useState<HeroReaction[]>([]);
  const nextReactionKeyRef = useRef(0);

  useEffect(() => {
    if (reactions.length === 0) return undefined;
    const timer = window.setTimeout(() => {
      setReactions(current => current.slice(1));
    }, HERO_REACTION_MS);
    return () => window.clearTimeout(timer);
  }, [reactions]);

  const react = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    // Primary button or touch only (a right click opens the context menu instead).
    if (event.button > 0) return;
    nextReactionKeyRef.current += 1;
    const key = nextReactionKeyRef.current;
    // One live reaction per mascot: a second tap restarts it instead of stacking sparkles.
    setReactions(current => [...current.filter(reaction => reaction.index !== index), { index, key }]);
  };

  return (
    <div className="join-hero" aria-hidden="true">
      <div className="join-hero__figures">
        {HERO_ROW.map((item, index) => {
          const reaction = reactions.find(entry => entry.index === index);
          return (
            <div
              key={item.characterId}
              className="join-hero__figure"
              style={{ '--hero-index': index } as CSSProperties}
              // Two names for the same jump: switching between them restarts the CSS animation without remounting the image
              // (a remount would replay the greeting hops).
              data-reaction={reaction ? (reaction.key % 2 === 0 ? 'a' : 'b') : undefined}
              onPointerDown={react(index)}
            >
              <span className="join-hero__body">
                <img className="join-hero__mascot" src={item.src} alt="" draggable={false} />
              </span>
              {reaction ? <MascotSparkles key={reaction.key} className="join-hero__sparkles" /> : null}
            </div>
          );
        })}
      </div>
      <div className="join-hero__board">
        {HERO_ROW.map(item => (
          <span key={item.characterId} className="join-hero__tile" style={{ '--hero-tile': item.tileColor } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
