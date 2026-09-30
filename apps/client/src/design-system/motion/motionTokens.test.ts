import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { motionDuration, motionEase, motionSpring } from './motionTokens';

// A variable path keeps Vite from rewriting the URL into an asset reference.
const motionCssPath = '../tokens/motion.css';
const motionCss = readFileSync(fileURLToPath(new URL(motionCssPath, import.meta.url)), 'utf8');

function rootBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Missing ${selector} block in motion.css`);
  return css.slice(start, css.indexOf('}', start));
}

describe('motion tokens', () => {
  it('mirrors the CSS durations in the TypeScript tokens', () => {
    const root = rootBlock(motionCss, ':root');
    for (const [name, seconds] of Object.entries(motionDuration)) {
      expect(root).toContain(`--motion-duration-${name}: ${Math.round(seconds * 1000)}ms;`);
    }
  });

  it('mirrors the easing curves and the pop spring', () => {
    const root = rootBlock(motionCss, ':root');
    expect(root).toContain(`--motion-ease-out: cubic-bezier(${motionEase.out.join(', ')});`);
    expect(root).toContain(`--motion-ease-in-out: cubic-bezier(${motionEase.inOut.join(', ')});`);
    expect(motionSpring).toEqual({ stiffness: 520, damping: 32 });
  });

  it('keeps celebrations at or under 1200 ms', () => {
    expect(motionDuration.celebration).toBeLessThanOrEqual(1.2);
  });

  it('zeroes every duration for the in-game setting as well as the OS query', () => {
    const attributeBlock = rootBlock(motionCss, ":root[data-reduced-motion='true']");
    const mediaStart = motionCss.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(mediaStart).toBeGreaterThan(-1);
    const mediaBlock = motionCss.slice(mediaStart, motionCss.indexOf(":root[data-reduced-motion='true']"));
    for (const block of [attributeBlock, mediaBlock]) {
      for (const name of [...Object.keys(motionDuration).map(key => `--motion-duration-${key}`), '--motion-fast', '--motion-normal', '--motion-slow']) {
        expect(block).toContain(`${name}: 0ms;`);
      }
    }
  });

  it('keeps the legacy motion names as aliases under the v2 theme', () => {
    const v2 = rootBlock(motionCss, ":root[data-visual-theme='v2']");
    expect(v2).toContain('--motion-fast: var(--motion-duration-micro);');
    expect(v2).toContain('--motion-ease: var(--motion-ease-out);');
  });
});
