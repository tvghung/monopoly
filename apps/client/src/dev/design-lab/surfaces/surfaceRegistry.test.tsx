import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SurfacesSection from '../sections/SurfacesSection';
import { SURFACES, findSurface } from './surfaceRegistry';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function openSurface(search: string) {
  window.history.replaceState(null, '', `/${search}`);
  return render(<SurfacesSection />);
}

describe('Design Lab surfaces', () => {
  it('has unique ids and labels for every fixture', () => {
    expect(new Set(SURFACES.map(surface => surface.id)).size).toBe(SURFACES.length);
    expect(new Set(SURFACES.map(surface => surface.label)).size).toBe(SURFACES.length);
    expect(findSurface('buy')?.group).toBe('Decisions');
    expect(findSurface('nope')).toBeUndefined();
    expect(findSurface(null)).toBeUndefined();
  });

  it('lists every surface on the index, with a link that selects it', () => {
    const { container } = openSurface('?phase4-uat=1&design-lab=1&section=surfaces');
    const links = [...container.querySelectorAll<HTMLAnchorElement>('.lab-surfaces-index a')];
    expect(links).toHaveLength(SURFACES.length);
    expect(links[0].getAttribute('href')).toContain('surface=');
  });

  it.each(SURFACES.map(surface => surface.id))('renders the %s surface alone with real content', id => {
    openSurface(`?phase4-uat=1&design-lab=1&section=surfaces&surface=${id}&chrome=hidden`);
    const root = document.querySelector(`[data-surface="${id}"]`);
    expect(root).not.toBeNull();
    // Dialogs are portaled to the body, so look at the whole document for visible text.
    expect(document.body.textContent?.trim().length ?? 0).toBeGreaterThan(20);
  });
});
