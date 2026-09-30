import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActionIcon } from './ActionIcon';
import {
  ACTION_ICON_NAMES,
  ACTION_ICONS,
  isActionIconName,
  type ActionIconName,
} from './actionIcons';

afterEach(cleanup);

describe('action icon registry', () => {
  it('lists every name exactly once and maps each to an icon', () => {
    expect(new Set(ACTION_ICON_NAMES).size).toBe(ACTION_ICON_NAMES.length);
    expect(Object.keys(ACTION_ICONS).sort()).toEqual([...ACTION_ICON_NAMES].sort());
  });

  it.each([...ACTION_ICON_NAMES])('renders %s as a decorative svg', name => {
    const { container } = render(<ActionIcon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('class')).toContain('action-icon');
  });

  it('keeps the meaning pairs that share a glyph', () => {
    const shared: ActionIconName[][] = [
      ['close', 'cancel', 'unready', 'decline'],
      ['confirm', 'accept', 'ready'],
      ['retry', 'refresh'],
      ['reset', 'playAgain'],
    ];
    for (const names of shared) {
      for (const name of names) expect(ACTION_ICONS[name]).toBe(ACTION_ICONS[names[0]]);
    }
    expect(ACTION_ICONS.roll).not.toBe(ACTION_ICONS.buy);
  });

  it('forwards size and extra class names', () => {
    const { container } = render(<ActionIcon name="roll" size={24} className="extra" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('class')).toContain('extra');
  });

  it('narrows unknown strings', () => {
    expect(isActionIconName('roll')).toBe(true);
    expect(isActionIconName('nope')).toBe(false);
    expect(isActionIconName('toString')).toBe(false);
  });
});
