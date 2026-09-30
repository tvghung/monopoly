import { useEffect, useState, type ReactNode } from 'react';
import type { VisualTheme } from '../../game/ui/propertyVisualColors';

/** Dev-only review helpers shared by the Design Lab sections. English labels are fine here. */

export const LAB_SECTIONS = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'typography', label: 'Typography' },
  { id: 'components', label: 'Components' },
  { id: 'game-ui', label: 'Game UI concepts' },
  { id: 'scene-palette', label: 'Scene palette' },
  { id: 'purchase', label: 'Screen: Purchase' },
  { id: 'lobby', label: 'Screen: Lobby' },
  { id: 'landing', label: 'Screen: Landing' },
  { id: 'hud', label: 'Screen: HUD' },
] as const;

export type LabSectionId = typeof LAB_SECTIONS[number]['id'];

export function isLabSectionId(value: string | null): value is LabSectionId {
  return value !== null && LAB_SECTIONS.some(section => section.id === value);
}

export interface DesignLabParams {
  section: LabSectionId | null;
  theme: VisualTheme;
}

/** `?design-lab=1&section=<id>&theme=v1|v2`; the theme defaults to v2 because that is what is under review. */
export function readDesignLabParams(search: string): DesignLabParams {
  const params = new URLSearchParams(search);
  const section = params.get('section');
  return {
    section: isLabSectionId(section) ? section : null,
    theme: params.get('theme') === 'v1' ? 'v1' : 'v2',
  };
}

export function applyVisualTheme(theme: VisualTheme): void {
  if (theme === 'v2') document.documentElement.dataset.visualTheme = 'v2';
  else delete document.documentElement.dataset.visualTheme;
}

const LAB_FONT_CHECKS: readonly [font: string, sample: string][] = [
  ['800 1em "Baloo 2"', 'Cờ Tỷ Phú Việt Nam Ỷ Ẫ Ự Ữ Ỹ ở ổ ỡ ợ Đà Nẵng'],
  ['700 1em "Baloo 2"', 'Cờ Tỷ Phú Việt Nam Ỷ Ẫ Ự Ữ Ỹ ở ổ ỡ ợ Đà Nẵng'],
  ['500 1em "Be Vietnam Pro"', 'Cờ Tỷ Phú Việt Nam 0123456789'],
  ['700 1em "Be Vietnam Pro"', 'Cờ Tỷ Phú Việt Nam 0123456789'],
  ['800 1em "Be Vietnam Pro"', 'Cờ Tỷ Phú Việt Nam 0123456789'],
];

/** True once the Lab's fonts (including the Vietnamese subsets) have loaded. */
export function useLabFontsLoaded(): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // jsdom has no FontFaceSet; nothing to wait for there.
    if (typeof document.fonts === 'undefined') {
      setLoaded(true);
      return undefined;
    }
    void Promise.all(LAB_FONT_CHECKS.map(([font, sample]) => document.fonts.load(font, sample)))
      .then(() => document.fonts.ready)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);
  return loaded;
}

export function LabSection({
  id, title, note, children,
}: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="lab-section" data-lab-section={id}>
      <header className="lab-section__header">
        <h2 className="lab-section__title">{title}</h2>
        {note ? <p className="lab-section__note">{note}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function LabBlock({ caption, children, wide = false }: { caption: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={`lab-block${wide ? ' lab-block--wide' : ''}`}>
      <figcaption className="lab-block__caption">{caption}</figcaption>
      <div className="lab-block__body">{children}</div>
    </figure>
  );
}
