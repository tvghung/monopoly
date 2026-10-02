import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GroupPips from './GroupPips';

afterEach(cleanup);

const GROUPS = [
  { group: 'brown', owned: 2, total: 2 },
  { group: 'lightblue', owned: 1, total: 3 },
  { group: 'pink', owned: 0, total: 3 },
] as const;

describe('GroupPips', () => {
  it('renders one pip per group with empty, partial and complete states', () => {
    const { container } = render(<GroupPips groups={GROUPS} />);

    const pips = [...container.querySelectorAll('.ds-group-pips__pip')];
    expect(pips.map(pip => pip.className.match(/--(empty|partial|complete)/u)?.[1])).toEqual([
      'complete', 'partial', 'empty',
    ]);
    expect((pips[1] as HTMLElement).style.getPropertyValue('--ds-pip-fill')).toBe('33%');
  });

  it('summarizes owned groups for assistive technology', () => {
    render(<GroupPips groups={GROUPS} />);

    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Nhóm tài sản: Nhóm Nâu 2/2, Nhóm Xanh nhạt 1/3',
    );
  });

  it('says so when nothing is owned', () => {
    render(<GroupPips groups={[{ group: 'red', owned: 0, total: 3 }]} />);

    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Chưa sở hữu nhóm tài sản nào');
  });

  it('clamps over-owned groups to a full pip', () => {
    const { container } = render(<GroupPips groups={[{ group: 'green', owned: 5, total: 3 }]} />);

    expect((container.querySelector('.ds-group-pips__pip') as HTMLElement).style.getPropertyValue('--ds-pip-fill')).toBe('100%');
  });
});
