import type { CSSProperties } from 'react';
import { getLandmarkVisual } from '../game/ui/property/landmarkVisuals';
import JoinHero from './JoinHero';
import './style/LauncherScene.css';

/**
 * Landmarks of the board, left to right (Hạ Long, Chùa Cầu, Landmark 81, Cầu Vàng, Ngọ Môn). Each is a flat picture from
 * `public/art/landmarks/` pinned up like a postcard behind the mascots; the middle one is the tallest silhouette.
 */
const POSTCARD_TILES = [26, 13, 39, 24, 14] as const;

const POSTCARDS = POSTCARD_TILES.flatMap(tileId => {
  const visual = getLandmarkVisual(tileId);
  return visual ? [{ tileId, src: visual.artUrl }] : [];
});

/**
 * The picture behind the start screen's menu: the board's landmarks over the eight mascots standing on their mini board.
 * It is decoration only: hidden from assistive technology, empty alt text, no title and no words in it. The art is on the
 * right of the window; the menu column on the left is plain content over the same warm paper background.
 */
export default function LauncherScene() {
  return (
    <div className="launcher-scene" aria-hidden="true">
      <div className="launcher-scene__stage">
        <div className="launcher-scene__postcards">
          {POSTCARDS.map((card, index) => (
            <div key={card.tileId} className="launcher-scene__postcard" style={{ '--card-index': index } as CSSProperties}>
              <img className="launcher-scene__picture" src={card.src} alt="" draggable={false} />
            </div>
          ))}
        </div>
        <JoinHero />
      </div>
    </div>
  );
}
