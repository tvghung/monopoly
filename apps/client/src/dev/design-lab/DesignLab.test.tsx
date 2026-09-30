import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Phase4UatHarness from '../phase4-uat/Phase4UatHarness';
import { LAB_SECTIONS, readDesignLabParams } from './labKit';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  delete document.documentElement.dataset.visualTheme;
});

function openLab(search: string) {
  window.history.replaceState(null, '', `/${search}`);
  return render(<Phase4UatHarness />);
}

describe('readDesignLabParams', () => {
  it('accepts known sections and defaults to the v2 theme', () => {
    expect(readDesignLabParams('?design-lab=1&section=tokens')).toEqual({ section: 'tokens', theme: 'v2' });
    expect(readDesignLabParams('?section=nope').section).toBeNull();
    expect(readDesignLabParams('?theme=v1').theme).toBe('v1');
    expect(readDesignLabParams('?theme=other').theme).toBe('v2');
  });
});

describe('Design Lab', () => {
  it.each(LAB_SECTIONS.filter(section => section.id !== 'hud').map(section => section.id))(
    'renders the %s section and becomes ready',
    async id => {
      const { container } = openLab(`?phase4-uat=1&design-lab=1&section=${id}`);

      expect(container.querySelector(`[data-lab-section="${id}"]`)).not.toBeNull();
      await waitFor(() => expect(container.querySelector('[data-design-lab-ready="true"]')).not.toBeNull());
    },
  );

  it('renders every section on the overview page', () => {
    const { container } = openLab('?phase4-uat=1&design-lab=1');

    for (const section of LAB_SECTIONS.filter(candidate => candidate.id !== 'hud')) {
      expect(container.querySelector(`[data-lab-section="${section.id}"]`)).not.toBeNull();
    }
  });

  it('applies the v2 theme by default, switches to v1 and restores the document on unmount', () => {
    const { unmount } = openLab('?phase4-uat=1&design-lab=1&section=tokens');
    expect(document.documentElement.dataset.visualTheme).toBe('v2');

    fireEvent.click(screen.getByRole('radio', { name: 'v1 (current)' }));
    expect(document.documentElement.dataset.visualTheme).toBeUndefined();

    unmount();
    expect(document.documentElement.dataset.visualTheme).toBeUndefined();
  });

  it('honors the theme parameter', () => {
    openLab('?phase4-uat=1&design-lab=1&section=tokens&theme=v1');
    expect(document.documentElement.dataset.visualTheme).toBeUndefined();
  });

  it('renders the HUD concept over the real board with the dev controls removed', async () => {
    const { container } = openLab('?phase4-uat=1&design-lab=1&section=hud');

    expect(container.querySelector('main.phase4-uat[data-scenario="stations-4"]')).not.toBeNull();
    expect(screen.queryByLabelText('Kịch bản')).toBeNull();
    expect(container.querySelectorAll('.lab-hud__card')).toHaveLength(4);
    await waitFor(() => expect(container.querySelector('.lab-hud[data-design-lab-ready="true"]')).not.toBeNull(), { timeout: 10_000 });
  }, 20_000);
});
