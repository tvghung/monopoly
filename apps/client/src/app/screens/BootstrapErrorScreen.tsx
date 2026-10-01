import { ActionIcon } from '../../design-system/icons/ActionIcon';
import ErrorScreen from './ErrorScreen';

export type BootstrapErrorKind = 'bootstrap' | 'runtime-config' | 'render';

const errorCopy: Record<BootstrapErrorKind, string> = {
  bootstrap: 'Không thể khởi động trò chơi. Hãy thử lại.',
  'runtime-config': 'Không thể chuẩn bị kết nối trò chơi. Hãy thử lại.',
  render: 'Không thể hiển thị trò chơi. Hãy tải lại để thử lại.',
};

interface BootstrapErrorScreenProps {
  kind?: BootstrapErrorKind;
  onRetry: () => void;
  title?: string;
  actionLabel?: string;
}

export default function BootstrapErrorScreen({
  kind = 'bootstrap',
  onRetry,
  title = 'Không thể khởi động trò chơi',
  actionLabel = kind === 'render' ? 'Tải lại trò chơi' : 'Thử lại',
}: BootstrapErrorScreenProps) {
  return (
    <ErrorScreen
      title={title}
      message={errorCopy[kind]}
      action={{ label: actionLabel, icon: <ActionIcon name="retry" />, onClick: onRetry }}
    />
  );
}
