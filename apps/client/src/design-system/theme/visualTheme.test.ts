import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OTB_PALETTE } from '../tokens/palette';
import { applyVisualTheme, DEFAULT_VISUAL_THEME } from './visualTheme';

const readShellFile = (relativePath: string): string => readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
);

describe('visual theme', () => {
  it('defaults to v2 and toggles the attribute on the given root', () => {
    const root = document.createElement('html');
    expect(DEFAULT_VISUAL_THEME).toBe('v2');

    applyVisualTheme('v2', root);
    expect(root.dataset.visualTheme).toBe('v2');

    applyVisualTheme('v1', root);
    expect(root.dataset.visualTheme).toBeUndefined();
    expect(root.hasAttribute('data-visual-theme')).toBe(false);
  });
});

describe('page shell', () => {
  const indexHtml = readShellFile('../../../index.html');
  const manifest = JSON.parse(readShellFile('../../../public/manifest.json')) as Record<string, string>;

  it('starts in the v2 theme so the first paint has no flash of v1 tokens', () => {
    expect(indexHtml).toMatch(/<html[^>]*\sdata-visual-theme="v2"/);
  });

  it('uses palette values for the browser chrome and the install splash', () => {
    const themeColor = /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/.exec(indexHtml)?.[1];
    expect(themeColor?.toLowerCase()).toBe(OTB_PALETTE.backdrop.toLowerCase());
    expect(manifest.theme_color.toLowerCase()).toBe(OTB_PALETTE.backdrop.toLowerCase());
    expect(manifest.background_color.toLowerCase()).toBe(OTB_PALETTE['paper-50'].toLowerCase());
  });
});
