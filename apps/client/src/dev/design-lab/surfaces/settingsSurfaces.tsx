import SettingsPanel from '../../../settings/SettingsPanel';
import { noop, SurfaceProviders, type SurfaceFixture } from './surfaceKit';

/** The settings dialog (plan 04 T04.10). */
export const SETTINGS_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'settings',
    label: 'Settings',
    group: 'Settings',
    render: () => (
      <SurfaceProviders>
        <SettingsPanel open onClose={noop} />
      </SurfaceProviders>
    ),
  },
];
