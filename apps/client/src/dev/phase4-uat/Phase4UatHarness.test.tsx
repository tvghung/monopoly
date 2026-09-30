import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Phase4UatHarness, { readHarnessUrlParams } from './Phase4UatHarness';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function openHarness(search: string) {
  window.history.replaceState(null, '', `/${search}`);
  return render(<Phase4UatHarness />);
}

function harnessMain(container: HTMLElement): HTMLElement {
  const main = container.querySelector<HTMLElement>('main.phase4-uat');
  if (!main) throw new Error('Harness main element not rendered.');
  return main;
}

describe('readHarnessUrlParams', () => {
  it('selects a known scenario and falls back to the default for unknown keys', () => {
    expect(readHarnessUrlParams('?phase4-uat=1&scenario=rent').scenario).toBe('rent');
    expect(readHarnessUrlParams('?phase4-uat=1&scenario=does-not-exist').scenario).toBe('stations-4');
    expect(readHarnessUrlParams('?phase4-uat=1').scenario).toBe('stations-4');
  });

  it('reads the controls and gallery switches', () => {
    expect(readHarnessUrlParams('?uat-controls=collapsed').controlsCollapsed).toBe(true);
    expect(readHarnessUrlParams('?uat-controls=open').controlsCollapsed).toBe(false);
    expect(readHarnessUrlParams('?card-gallery=1').cardGallery).toBe(true);
    expect(readHarnessUrlParams('').cardGallery).toBe(false);
  });
});

describe('Phase4UatHarness URL contract', () => {
  it('starts on the scenario named by the scenario parameter', () => {
    const { container } = openHarness('?phase4-uat=1&scenario=board-readability');
    expect(harnessMain(container).dataset.scenario).toBe('board-readability');
    expect(screen.getByLabelText('Kịch bản')).toHaveProperty('value', 'board-readability');
  });

  it('ignores an unknown scenario key', () => {
    const { container } = openHarness('?phase4-uat=1&scenario=nope');
    expect(harnessMain(container).dataset.scenario).toBe('stations-4');
  });

  it('starts with the controls collapsed when asked to', () => {
    openHarness('?phase4-uat=1&uat-controls=collapsed');
    expect(screen.queryByLabelText('Kịch bản')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mở điều khiển UAT' })).toBeTruthy();
  });

  it('marks a static scenario ready and keeps the marker with collapsed controls', async () => {
    const { container } = openHarness('?phase4-uat=1&scenario=stations-2&uat-controls=collapsed');
    await waitFor(() => expect(harnessMain(container).dataset.uatReady).toBe('true'));
  });

  it('resets the ready marker while a scenario replays and settles again afterwards', async () => {
    const { container } = openHarness('?phase4-uat=1&scenario=purchase');
    await waitFor(() => expect(harnessMain(container).dataset.uatReady).toBe('true'), { timeout: 10_000 });
    fireEvent.click(screen.getByRole('button', { name: /Chạy lại/ }));
    expect(harnessMain(container).dataset.uatReady).toBe('false');
    await waitFor(() => expect(harnessMain(container).dataset.uatReady).toBe('true'), { timeout: 10_000 });
  }, 30_000);
});
