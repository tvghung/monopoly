import { describe, expect, it } from 'vitest';
import {
  PLAYER_ACCENT_DARK_TOKEN,
  PLAYER_ACCENT_PRIMARY_TOKEN,
  colorizeCharacterSvg,
} from './characterSvg';

describe('character SVG colorizer', () => {
  it('recolors only the exact accent tokens', () => {
    const source = `<svg><path fill="${PLAYER_ACCENT_PRIMARY_TOKEN}" stroke="${PLAYER_ACCENT_DARK_TOKEN}"/><path fill="#FFC400"/></svg>`;
    const result = colorizeCharacterSvg(source, 'red');

    expect(result).toContain('#f2384a');
    expect(result).toContain('#bd2033');
    expect(result).toContain('#FFC400');
    expect(result).not.toContain(PLAYER_ACCENT_PRIMARY_TOKEN);
    expect(result).not.toContain(PLAYER_ACCENT_DARK_TOKEN);
  });

  it('rejects scripts and external references', () => {
    expect(() => colorizeCharacterSvg('<svg><script>alert(1)</script></svg>', 'blue')).toThrow();
    expect(() => colorizeCharacterSvg('<svg><image href="https://example.com/a.svg"/></svg>', 'blue')).toThrow();
  });
});
