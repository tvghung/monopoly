import { StrictMode } from 'react';
import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { chanceCards, chestCards } from '@monopoly/shared';
import HowToPlayButton from './HowToPlayButton';
import { HowToPlayProvider } from './HowToPlayProvider';
import { useHowToPlay } from './howToPlayContext';
import { buildHowToPlayModel } from './model';

afterEach(cleanup);

const GUIDE = 'Hướng dẫn chơi';
const dialog = () => screen.queryByRole('dialog', { name: GUIDE });
const sections = (): HTMLDetailsElement[] => [
  ...document.querySelectorAll<HTMLDetailsElement>('.how-to-play__section'),
];
const openers = () => screen.getAllByRole('button', { name: GUIDE });

function openGuide() {
  const opener = screen.getByRole('button', { name: GUIDE });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('HowToPlayButton', () => {
  it('leaves itself out when nothing can open the guide, so no screen shows a dead button', () => {
    const { container } = render(<HowToPlayButton />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is a labelled 44 px icon key that announces a dialog', () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    const button = screen.getByRole('button', { name: GUIDE });
    expect(button.getAttribute('aria-label')).toBe(GUIDE);
    expect(button.getAttribute('title')).toBe(GUIDE);
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('type')).toBe('button');
    // The text is the accessible name; the glyph is decoration. `ds-icon-button--md` is 2.75rem (44 px) in the design system.
    expect(button.textContent).toBe('');
    expect(button.className).toContain('ds-icon-button--md');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('can carry the words for roomy places, with the same accessible name', () => {
    render(<HowToPlayProvider><HowToPlayButton variant="labelled" /></HowToPlayProvider>);
    const button = screen.getByRole('button', { name: GUIDE });
    expect(button.textContent).toBe(GUIDE);
    expect(button.className).toContain('ds-button--ghost');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('can be pinned to the top right corner of a screen that has no toolbar', () => {
    render(<HowToPlayProvider><HowToPlayButton placement="corner" className="extra" /></HowToPlayProvider>);
    const button = screen.getByRole('button', { name: GUIDE });
    expect(button.className).toContain('how-to-play-button--corner');
    expect(button.className).toContain('extra');
  });

  it('is inline unless it is asked to sit in a corner', () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    expect(screen.getByRole('button', { name: GUIDE }).className).not.toContain('how-to-play-button--corner');
  });
});

describe('HowToPlayProvider', () => {
  it('owns one dialog: any number of buttons open the same single guide', () => {
    render(
      <HowToPlayProvider>
        <HowToPlayButton />
        <HowToPlayButton variant="labelled" />
      </HowToPlayProvider>,
    );
    expect(dialog()).toBeNull();
    expect(openers()).toHaveLength(2);

    fireEvent.click(openers()[1]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog()).not.toBeNull();
  });

  it('exposes open, close and the open state to a consumer', async () => {
    function Probe() {
      const controls = useHowToPlay();
      return (
        <>
          <output data-testid="state">{String(controls.available)}-{String(controls.isOpen)}</output>
          <button type="button" onClick={controls.open}>mở</button>
          <button type="button" onClick={controls.close}>đóng</button>
        </>
      );
    }
    render(<HowToPlayProvider><Probe /></HowToPlayProvider>);
    expect(screen.getByTestId('state').textContent).toBe('true-false');

    fireEvent.click(screen.getByRole('button', { name: 'mở' }));
    expect(screen.getByTestId('state').textContent).toBe('true-true');
    expect(dialog()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'đóng' }));
    expect(screen.getByTestId('state').textContent).toBe('true-false');
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('reports itself unavailable outside a provider', () => {
    function Probe() {
      const controls = useHowToPlay();
      return <output data-testid="state">{String(controls.available)}</output>;
    }
    render(<Probe />);
    expect(screen.getByTestId('state').textContent).toBe('false');
  });

  it('works under StrictMode without any settings, audio or toast provider', async () => {
    render(<StrictMode><HowToPlayProvider><HowToPlayButton /></HowToPlayProvider></StrictMode>);
    openGuide();
    expect(dialog()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialog()).toBeNull());
  });
});

describe('HowToPlayModal', () => {
  it('opens a titled dialog with a short introduction and one collapsed topic for each section of the guide', () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    openGuide();

    const guide = screen.getByRole('dialog', { name: GUIDE });
    expect(within(guide).getByRole('heading', { level: 2, name: GUIDE })).toBeTruthy();
    const model = buildHowToPlayModel();
    expect(within(guide).getByText(model.intro)).toBeTruthy();

    expect(sections()).toHaveLength(12);
    expect(sections().map((section) => section.querySelector('summary')?.textContent)).toEqual(
      model.sections.map((section, index) => `${index + 1}${section.title}`),
    );
    // Short by default: nothing is open.
    for (const section of sections()) expect(section.open).toBe(false);
    // Native disclosures: the summary is the first child of its details element.
    for (const section of sections()) expect(section.firstElementChild?.tagName).toBe('SUMMARY');
  });

  it('opens a topic when its summary is activated, and each topic opens on its own', () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    openGuide();

    const [first, second] = sections();
    fireEvent.click(second.querySelector('summary') as HTMLElement);
    expect(second.open).toBe(true);
    expect(first.open).toBe(false);

    fireEvent.click(first.querySelector('summary') as HTMLElement);
    expect(first.open).toBe(true);
    expect(second.open).toBe(true);

    fireEvent.click(second.querySelector('summary') as HTMLElement);
    expect(second.open).toBe(false);
  });

  it('puts keyboard focus on the first topic, which is reachable like any control', () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    openGuide();

    const firstSummary = sections()[0].querySelector('summary') as HTMLElement;
    expect(document.activeElement).toBe(firstSummary);
    for (const section of sections()) {
      const summary = section.querySelector('summary') as HTMLElement;
      expect(summary.getAttribute('tabindex')).toBeNull();
    }
  });

  it('lists the 13 Cơ Hội and 15 Khí Vận cards inside their own collapsed topics', () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    openGuide();

    const chance = document.querySelector<HTMLDetailsElement>('[data-section="chance-cards"]') as HTMLDetailsElement;
    const chest = document.querySelector<HTMLDetailsElement>('[data-section="chest-cards"]') as HTMLDetailsElement;
    expect(chance.open).toBe(false);
    expect(chest.open).toBe(false);

    const chanceList = within(chance).getByRole('list', { name: 'Danh sách thẻ Cơ Hội' });
    const chestList = within(chest).getByRole('list', { name: 'Danh sách thẻ Khí Vận' });
    expect(within(chanceList).getAllByRole('listitem')).toHaveLength(chanceCards.length);
    expect(within(chestList).getAllByRole('listitem')).toHaveLength(chestCards.length);
    for (const card of chanceCards) expect(within(chanceList).getByText(card.message)).toBeTruthy();
    for (const card of chestCards) expect(within(chestList).getByText(card.message)).toBeTruthy();
  });

  it('draws every table as a named, focusable, scrollable region with real header cells', () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    openGuide();

    const wraps = [...document.querySelectorAll<HTMLElement>('.how-to-play__table-wrap')];
    const tableBlocks = buildHowToPlayModel().sections.flatMap(
      (section) => section.blocks.filter((block) => block.kind === 'table'),
    );
    expect(tableBlocks.length).toBeGreaterThanOrEqual(5);
    expect(wraps).toHaveLength(tableBlocks.length);
    for (const wrap of wraps) {
      const caption = wrap.querySelector('caption')?.textContent;
      expect(caption && caption.length > 0).toBe(true);
      expect(wrap.getAttribute('role')).toBe('region');
      expect(wrap.getAttribute('aria-label')).toBe(caption);
      expect(wrap.getAttribute('tabindex')).toBe('0');
      expect(wrap.querySelectorAll('thead th[scope="col"]').length).toBeGreaterThan(0);
      expect(wrap.querySelectorAll('tbody th[scope="row"]').length).toBeGreaterThan(0);
    }
    // The district color is a decoration, never the only way to tell a district.
    const swatches = [...document.querySelectorAll('.how-to-play__swatch')];
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      expect(swatch.getAttribute('aria-hidden')).toBe('true');
      expect(swatch.parentElement?.textContent?.trim()).toMatch(/^Nhóm /u);
    }
  });

  it('closes with Escape, the close key and a click outside, and gives focus back to the button', async () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);

    const opener = openGuide();
    expect(dialog()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialog()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));

    fireEvent.click(opener);
    expect(dialog()).not.toBeNull();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(dialog()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));

    fireEvent.click(opener);
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(overlay);
    await waitFor(() => expect(dialog()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('is the ordinary dialog: modal, labelled by its title, sized for reading and scrolled inside', () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    openGuide();

    const guide = screen.getByRole('dialog', { name: GUIDE });
    expect(guide.getAttribute('aria-modal')).toBe('true');
    expect(guide.className).toContain('ds-modal--lg');
    expect(guide.className).toContain('how-to-play');
    expect(guide.querySelector('.ds-modal__body')).not.toBeNull();
    expect(guide.querySelector('.ds-modal__eyebrow')?.textContent).toBe('Cờ Tỷ Phú Việt Nam');
  });

  it('starts every visit collapsed again after it was closed', async () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    openGuide();
    fireEvent.click(sections()[1].querySelector('summary') as HTMLElement);
    expect(sections()[1].open).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    // The dialog animates out first; wait until it has left the page so the next visit builds a fresh one.
    await waitFor(() => expect(document.querySelector('.how-to-play')).toBeNull());

    openGuide();
    expect(sections()).toHaveLength(12);
    for (const section of sections()) expect(section.open).toBe(false);
  });

  it('shows plain text only: the guide never injects markup', () => {
    render(<HowToPlayProvider><HowToPlayButton /></HowToPlayProvider>);
    openGuide();
    const guide = screen.getByRole('dialog', { name: GUIDE });
    expect(guide.querySelector('script, iframe, img')).toBeNull();
    expect(guide.textContent).not.toContain('<');
  });
});
