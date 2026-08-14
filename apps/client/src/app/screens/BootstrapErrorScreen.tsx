import Button from '../../design-system/components/Button/Button';
import './screens.css';

export default function BootstrapErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <main className="app-screen app-screen--error" role="alert">
      <p className="app-screen__brand-mark" aria-hidden="true">OWN THE BLOCK</p>
      <h1>Không thể khởi động trò chơi</h1>
      <p>{error}</p>
      <Button onClick={onRetry}>Thử lại</Button>
    </main>
  );
}

