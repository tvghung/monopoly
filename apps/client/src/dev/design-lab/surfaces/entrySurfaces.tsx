import JoinForm from '../../../components/JoinForm';
import { noop, SurfaceProviders, type SurfaceFixture } from './surfaceKit';

/** The landing page and the desktop launcher (plan 04 T04.11 and T04.12). */
export const ENTRY_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'landing',
    label: 'Landing',
    group: 'Pre-game',
    render: () => (
      <SurfaceProviders>
        <JoinForm onJoin={noop} busy={false} connected error={null} />
      </SurfaceProviders>
    ),
  },
  {
    id: 'landing-prefilled',
    label: 'Landing, room code from a link, connecting',
    group: 'Pre-game',
    render: () => (
      <SurfaceProviders>
        <JoinForm onJoin={noop} busy={false} connected={false} error="Không thể vào phòng. Hãy thử lại." initialRoomCode="GAME-1234" />
      </SurfaceProviders>
    ),
  },
];
