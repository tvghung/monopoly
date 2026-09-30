import DeedGallery from './DeedGallery';
import { SurfaceProviders, type SurfaceFixture } from './surfaceKit';

/** Deed cards, property inspection and the portfolios (plan 04 T04.3, T04.5 and T04.6). */
export const INSPECTION_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'deeds',
    label: 'Deed cards (all variants)',
    group: 'Inspection',
    render: () => <SurfaceProviders><DeedGallery /></SurfaceProviders>,
  },
];
