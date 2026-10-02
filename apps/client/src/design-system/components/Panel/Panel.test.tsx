import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GamePanel from '../GamePanel/GamePanel';
import Badge from '../Badge/Badge';
import Panel from './Panel';

afterEach(cleanup);

describe('Panel', () => {
  it('renders a titled section with tone and padding classes', () => {
    render(<Panel title="Tài sản" tone="soft" padding="lg">Nội dung</Panel>);

    const heading = screen.getByRole('heading', { name: 'Tài sản' });
    const panel = heading.parentElement;
    expect(panel?.tagName).toBe('SECTION');
    expect(panel?.className).toContain('ds-panel--soft');
    expect(panel?.className).toContain('ds-panel--pad-lg');
    expect(screen.getByText('Nội dung')).toBeTruthy();
  });

  it('can render as another landmark element and omits the heading without a title', () => {
    const { container } = render(<Panel as="aside">Ghi chú</Panel>);

    expect(container.querySelector('aside.ds-panel--paper.ds-panel--pad-md')).not.toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('keeps GamePanel as a compatible re-export', () => {
    render(<GamePanel title="Cũ">Vẫn chạy</GamePanel>);

    expect(screen.getByRole('heading', { name: 'Cũ' })).toBeTruthy();
    expect(GamePanel).toBe(Panel);
  });
});

describe('Badge', () => {
  it('renders every variant with its class', () => {
    render(
      <>
        {(['neutral', 'success', 'warning', 'danger', 'info'] as const).map(variant => (
          <Badge key={variant} variant={variant}>{variant}</Badge>
        ))}
      </>,
    );

    for (const variant of ['neutral', 'success', 'warning', 'danger', 'info']) {
      expect(screen.getByText(variant).className).toContain(`ds-badge--${variant}`);
    }
  });
});
