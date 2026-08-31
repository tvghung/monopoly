import { RefreshCw } from 'lucide-react';
import Button from '../../design-system/components/Button/Button';
import './screens.css';

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
    <main className="app-screen app-screen--error" role="alert">
      <p className="app-screen__brand-mark" aria-hidden="true">OWN THE BLOCK</p>
      <h1>{title}</h1>
      <p>{errorCopy[kind]}</p>
      <Button icon={<RefreshCw />} onClick={onRetry}>{actionLabel}</Button>
    </main>
  );
}
