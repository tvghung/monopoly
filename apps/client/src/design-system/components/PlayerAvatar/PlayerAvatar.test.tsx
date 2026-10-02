import { cleanup, render, screen } from '@testing-library/react';
import { CHARACTER_IDS } from '@monopoly/shared';
import { afterEach, describe, expect, it } from 'vitest';
import PlayerAvatar from './PlayerAvatar';

afterEach(cleanup);

describe('PlayerAvatar', () => {
  it('describes the mascot in Vietnamese and never adds visible text or a tooltip', () => {
    const { container } = render(<PlayerAvatar characterId="dog" colorId="red" />);

    const image = screen.getByRole('img', { name: 'Mascot Chó' });
    expect(image.getAttribute('title')).toBeNull();
    expect(container.textContent).toBe('');
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('colorizes the mascot art with the player color', () => {
    render(<PlayerAvatar characterId="cat" colorId="blue" />);

    const source = decodeURIComponent(screen.getByRole('img', { name: 'Mascot Mèo' }).getAttribute('src') ?? '');
    expect(source).toContain('#3567f2');
    expect(source).not.toContain('#FF00FF');
  });

  it('gives every mascot a Vietnamese label, including the legacy one', () => {
    for (const characterId of CHARACTER_IDS) {
      const view = render(<PlayerAvatar characterId={characterId} colorId="green" />);
      expect(view.container.querySelector('img')?.getAttribute('alt')).toMatch(/^Mascot /u);
      view.unmount();
    }
    render(<PlayerAvatar characterId={null} colorId="green" />);
    expect(screen.getByRole('img', { name: 'Mascot cũ' })).toBeTruthy();
  });

  it('scales the ring with the size and exposes size through CSS variables', () => {
    const small = render(<PlayerAvatar characterId="dog" colorId="red" size={32} />);
    expect((small.container.firstElementChild as HTMLElement).style.getPropertyValue('--ds-avatar-ring')).toBe('2px');
    const large = render(<PlayerAvatar characterId="dog" colorId="red" size={128} />);
    const largeElement = large.container.firstElementChild as HTMLElement;
    expect(largeElement.style.getPropertyValue('--ds-avatar-ring')).toBe('4px');
    expect(largeElement.style.getPropertyValue('--ds-avatar-size')).toBe('128px');
  });

  it('marks the active turn', () => {
    const { container } = render(<PlayerAvatar characterId="dog" colorId="red" active />);

    expect(container.firstElementChild?.className).toContain('ds-avatar--active');
  });

  it.each([
    ['offline', 'Mất kết nối', false],
    ['bankrupt', 'Phá sản', true],
    ['left', 'Đã rời phòng', true],
  ] as const)('labels the %s status and %s greys it out: %s', (status, label, inactive) => {
    const { container } = render(<PlayerAvatar characterId="panda" colorId="green" status={status} />);

    expect(screen.getByRole('img', { name: label })).toBeTruthy();
    expect(container.firstElementChild?.className.includes('ds-avatar--inactive')).toBe(inactive);
  });

  it('shows no status marker while online', () => {
    render(<PlayerAvatar characterId="duck" colorId="orange" status="online" />);

    expect(screen.getAllByRole('img')).toHaveLength(1);
  });
});
