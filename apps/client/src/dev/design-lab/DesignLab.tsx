import { useEffect, useState, type ComponentType } from 'react';
import SegmentedControl from '../../design-system/components/SegmentedControl/SegmentedControl';
import { DEFAULT_VISUAL_THEME } from '../../design-system/theme/visualTheme';
import type { VisualTheme } from '../../game/ui/propertyVisualColors';
import ComponentsSection from './sections/ComponentsSection';
import GameUiSection from './sections/GameUiSection';
import ScenePaletteSection from './sections/ScenePaletteSection';
import SurfacesSection from './sections/SurfacesSection';
import TokensSection from './sections/TokensSection';
import TypographySection from './sections/TypographySection';
import LandingConcept from './screens/LandingConcept';
import LobbyConcept from './screens/LobbyConcept';
import PurchaseConcept from './screens/PurchaseConcept';
import {
  LAB_SECTIONS,
  applyVisualTheme,
  readDesignLabParams,
  readSurfaceParams,
  useLabFontsLoaded,
  type LabSectionId,
} from './labKit';
import './DesignLab.css';

const SECTION_COMPONENTS: Record<Exclude<LabSectionId, 'hud'>, ComponentType> = {
  tokens: TokensSection,
  typography: TypographySection,
  components: ComponentsSection,
  'game-ui': GameUiSection,
  'scene-palette': ScenePaletteSection,
  purchase: PurchaseConcept,
  lobby: LobbyConcept,
  landing: LandingConcept,
  surfaces: SurfacesSection,
};

/** Keeps `<html data-visual-theme>` in sync with the Lab toggle and restores the app default on unmount. */
export function useLabTheme(initial: VisualTheme): [VisualTheme, (theme: VisualTheme) => void] {
  const [theme, setTheme] = useState<VisualTheme>(() => {
    // Applied during the first render so components that read the theme (district colors) are right at once.
    applyVisualTheme(initial);
    return initial;
  });
  // Re-applied in an effect too: StrictMode runs the cleanup of a mount once before the real mount.
  useEffect(() => {
    applyVisualTheme(theme);
    return () => applyVisualTheme(DEFAULT_VISUAL_THEME);
  }, [theme]);
  return [theme, next => { applyVisualTheme(next); setTheme(next); }];
}

function themeHref(section: LabSectionId | null, theme: VisualTheme): string {
  const params = new URLSearchParams({ 'phase4-uat': '1', 'design-lab': '1', theme });
  if (section) params.set('section', section);
  return `?${params.toString()}`;
}

/** Dev-only review surface for the V2 design system (plan 01). Never ships in production builds. */
export default function DesignLab() {
  const [params] = useState(() => readDesignLabParams(window.location.search));
  const [theme, setTheme] = useLabTheme(params.theme);
  const [{ chromeHidden }] = useState(() => readSurfaceParams(window.location.search));
  const fontsLoaded = useLabFontsLoaded();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const visibleSections = LAB_SECTIONS
    .filter(section => section.id !== 'hud')
    .filter(section => params.section === null || section.id === params.section);

  return (
    <div className="design-lab" data-design-lab-ready={fontsLoaded && mounted ? 'true' : 'false'} data-theme-under-review={theme}>
      {chromeHidden ? null : <header className="design-lab__bar">
        <strong className="design-lab__brand">Design Lab · Own the Block V2</strong>
        <nav className="design-lab__nav" aria-label="Design Lab sections">
          <a href={themeHref(null, theme)}>All</a>
          {LAB_SECTIONS.map(section => (
            <a key={section.id} href={themeHref(section.id, theme)} aria-current={params.section === section.id ? 'page' : undefined}>
              {section.label}
            </a>
          ))}
        </nav>
        <SegmentedControl
          label="Theme under review"
          options={[{ value: 'v1', label: 'v1 (current)' }, { value: 'v2', label: 'v2 (proposal)' }]}
          value={theme}
          onChange={setTheme}
        />
      </header>}
      <main className="design-lab__content" key={theme}>
        {visibleSections.map(section => {
          const Section = SECTION_COMPONENTS[section.id];
          return <Section key={section.id} />;
        })}
      </main>
    </div>
  );
}
