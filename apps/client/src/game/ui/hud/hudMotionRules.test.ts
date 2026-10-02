import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A variable path keeps Vite from rewriting the URL into an asset reference.
const hudCssPath = './hud.css';
const hudCss = readFileSync(fileURLToPath(new URL(hudCssPath, import.meta.url)), 'utf8');

/** Both ways a player asks for less motion: the app setting (DOM bridge) and the operating system. */
const REDUCED_MOTION_SETTING = ":root[data-reduced-motion='true']";
const REDUCED_MOTION_MEDIA = '@media (prefers-reduced-motion: reduce)';

function mediaBlock(css: string): string {
  const start = css.indexOf(REDUCED_MOTION_MEDIA);
  return start === -1 ? '' : css.slice(start, css.indexOf('\n}', start));
}

describe('HUD reduced motion (CSS contract)', () => {
  it.each([
    ['.turn-banner', 'turn-banner-fade'],
    ['.dice-callout', 'dice-callout-fade'],
    ['.game-board__roll-button', 'roll-cta-fade'],
  ])('%s fades instead of sliding or scaling', (selector, fade) => {
    const setting = hudCss.split('\n').find(line => line.startsWith(REDUCED_MOTION_SETTING) && line.includes(selector));
    expect(setting, `${selector} under the app setting`).toBeDefined();
    expect(setting).toContain(fade);
    const media = hudCss.split(REDUCED_MOTION_MEDIA).slice(1).find(block => block.includes(selector) && block.includes(fade));
    expect(media, `${selector} under prefers-reduced-motion`).toBeDefined();
  });

  it('drops the active-card pulse and keeps only the ring', () => {
    expect(hudCss).toContain(`${REDUCED_MOTION_SETTING} .player-card--pulse .player-card__face { animation: none; }`);
    expect(mediaBlock(hudCss)).toContain('.player-card--pulse .player-card__face { animation: none; }');
  });

  it('scales every HUD keyframe with the animation speed', () => {
    const animations = [...hudCss.matchAll(/(?:^|[\s{;])animation:\s*([^;}]+)[;}]/gu)]
      .map(match => match[1].trim())
      .filter(value => value !== 'none');
    expect(animations.length).toBeGreaterThan(0);
    for (const value of animations) {
      // A fixed 120 ms fade under reduced motion is the one allowed exception.
      if (value.includes('120ms')) continue;
      expect(value, value).toContain('var(--hud-speed)');
    }
  });
});
