import Button from '../../design-system/components/Button/Button';
import './screens.css';

interface BootstrapErrorScreenProps {
  error: string;
  onRetry: () => void;
  title?: string;
}

export default function BootstrapErrorScreen({
  error,
  onRetry,
  title = 'Không thể khởi động trò chơi',
}: BootstrapErrorScreenProps) {
  return (
    <section className="app-screen app-screen--error" role="alert">
      <div className="app-screen__content">
        <p className="app-screen__brand-mark" aria-hidden="true">OWN THE BLOCK</p>
        <h1>{title}</h1>
        <p className="app-screen__error-copy">{error}</p>
        <Button onClick={onRetry}>Thử lại</Button>
      </div>
    </section>
  );
}

