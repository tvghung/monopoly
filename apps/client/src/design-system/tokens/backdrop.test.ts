import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCENE_BACKDROP, SCENE_BACKDROP_OAK_SHARE } from '../../game/scene/board/boardVisualTokens';
import { mixHex } from './contrast';
import { OTB_PALETTE } from './palette';

// A variable path keeps Vite from rewriting the URL into an asset reference.
const colorsCssPath = './colors.css';
const colorsCss = readFileSync(fileURLToPath(new URL(colorsCssPath, import.meta.url)), 'utf8');

describe('scene backdrop', () => {
  it('is the oak mid tone shared by the WebGL clear color and the DOM behind the canvas', () => {
    const percent = Math.round(SCENE_BACKDROP_OAK_SHARE * 100);
    expect(colorsCss).toContain(
      `--color-scene-backdrop: color-mix(in srgb, var(--otb-table-oak) ${percent}%, var(--otb-table-oak-dark));`,
    );
    expect(SCENE_BACKDROP).toBe(mixHex(OTB_PALETTE['table-oak'], OTB_PALETTE['table-oak-dark'], SCENE_BACKDROP_OAK_SHARE));
    expect(SCENE_BACKDROP).toBe('#d2af83');
  });

  it('no longer paints the game surfaces with the teal canvas color', () => {
    for (const relative of ['../../components/style/BoardShell.css', '../../components/style/Board.css', '../../game/scene/GameScene.css']) {
      const path = relative;
      const css = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
      expect(css).toContain('var(--color-scene-backdrop)');
      expect(css).not.toContain('var(--color-canvas-deep)');
    }
  });
});
