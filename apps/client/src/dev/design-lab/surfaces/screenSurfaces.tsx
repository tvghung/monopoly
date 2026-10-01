import { useEffect } from 'react';
import BootstrapErrorScreen from '../../../app/screens/BootstrapErrorScreen';
import ErrorScreen from '../../../app/screens/ErrorScreen';
import LoadingScreen from '../../../app/screens/LoadingScreen';
import ConnectionOverlay from '../../../components/ConnectionOverlay';
import SpectatorBanner from '../../../components/SpectatorBanner';
import { useToast } from '../../../components/Toast';
import ConfirmationDialog from '../../../design-system/components/ConfirmationDialog/ConfirmationDialog';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import { roomExitContext } from '../../../roomExitContext';
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
  {
    id: 'loading-restoring',
    label: 'Loading screen, restoring a game',
    group: 'Screens',
    render: () => <LoadingScreen as="section" stage="restoring" />,
  },
  { id: 'bootstrap-error', label: 'Bootstrap error', group: 'Screens', render: () => <BootstrapErrorScreen onRetry={noop} /> },
  {
    id: 'failure-replaced',
    label: 'Failure, session opened elsewhere',
    group: 'Screens',
    render: () => (
      <ErrorScreen
        as="section"
        title="Phiên chơi đã được mở ở nơi khác"
        message="Phiên chơi này đã được mở trên một kết nối mới hơn."
      />
    ),
  },
  {
    id: 'failure-error',
    label: 'Failure, session could not be restored',
    group: 'Screens',
    render: () => (
      <ErrorScreen
        as="section"
        title="Không thể khôi phục ván chơi"
        message="Không thể kết nối đến máy chủ trò chơi."
        action={{ label: 'Thử lại', icon: <ActionIcon name="retry" />, onClick: noop }}
      />
    ),
  },
  { id: 'connection', label: 'Connection lost overlay', group: 'Screens', render: () => <ConnectionOverlay /> },
  {
    id: 'spectator',
    label: 'Spectator banner',
    group: 'Screens',
    render: () => (
      <roomExitContext.Provider value={{ requestLeave: noop, leaving: false, label: 'Rời phòng' }}>
        <SpectatorBanner />
      </roomExitContext.Provider>
    ),
  },
];
