import { useEffect } from 'react';
import BootstrapErrorScreen from '../../../app/screens/BootstrapErrorScreen';
import LoadingScreen from '../../../app/screens/LoadingScreen';
import ConnectionOverlay from '../../../components/ConnectionOverlay';
import SpectatorBanner from '../../../components/SpectatorBanner';
import { useToast } from '../../../components/Toast';
import ConfirmationDialog from '../../../design-system/components/ConfirmationDialog/ConfirmationDialog';
import { noop, SurfaceProviders, type SurfaceFixture } from './surfaceKit';

/** Shows one toast per variant on mount, for review captures. */
function ToastDemo() {
  const toast = useToast();
  useEffect(() => {
    toast.show('An đã mua Cà Mau với giá 60.000 ₫.', { variant: 'success' });
    toast.show('Bình mất kết nối. Ván chơi tạm dừng.', { variant: 'warning' });
    toast.show('Không thể gửi lựa chọn. Vui lòng thử lại.', { variant: 'error' });
    toast.show('Chi vừa vào phòng.', { variant: 'info' });
  }, [toast]);
  return <p style={{ padding: '2rem' }}>Bốn thông báo nhỏ hiện ở giữa phía trên.</p>;
}

/** Loading, failure, connection, spectator, toasts and the confirmation dialog (plan 04 T04.2 and T04.14). */
export const SCREEN_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'confirm-forfeit',
    label: 'Confirmation, forfeit',
    group: 'Screens',
    render: () => (
      <SurfaceProviders>
        <ConfirmationDialog
          open
          title="Bỏ cuộc khỏi ván chơi?"
          message="Bạn sẽ rời ván chơi và mất toàn bộ tài sản. Hành động này không thể hoàn tác."
          confirmLabel="Bỏ cuộc"
          onConfirm={noop}
          onCancel={noop}
        />
      </SurfaceProviders>
    ),
  },
  {
    id: 'toasts',
    label: 'Toasts',
    group: 'Screens',
    render: () => <SurfaceProviders><ToastDemo /></SurfaceProviders>,
  },
  { id: 'loading', label: 'Loading screen', group: 'Screens', render: () => <LoadingScreen stage="loading-assets" /> },
  { id: 'bootstrap-error', label: 'Bootstrap error', group: 'Screens', render: () => <BootstrapErrorScreen onRetry={noop} /> },
  { id: 'connection', label: 'Connection lost overlay', group: 'Screens', render: () => <ConnectionOverlay /> },
  { id: 'spectator', label: 'Spectator banner', group: 'Screens', render: () => <SpectatorBanner /> },
];
