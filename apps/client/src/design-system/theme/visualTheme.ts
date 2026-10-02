import type { VisualTheme } from '../../game/ui/propertyVisualColors';

/**
 * The theme every page starts in (plan 01 T01.12). `index.html` sets the same value on `<html>` so the
 * first paint already uses the v2 tokens; the bootstrap applies it again for hosts that skip that file.
 */
export const DEFAULT_VISUAL_THEME: VisualTheme = 'v2';

/** `v1` is the absence of the attribute: the v1 token values live under plain `:root`. */
export function applyVisualTheme(theme: VisualTheme, root: HTMLElement = document.documentElement): void {
  if (theme === 'v2') root.dataset.visualTheme = 'v2';
  else delete root.dataset.visualTheme;
}
