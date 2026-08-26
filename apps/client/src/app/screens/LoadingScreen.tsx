import type { BootStage } from '../bootstrap/types';
import './screens.css';

const stageMessages: Record<Exclude<BootStage, 'ready' | 'error'>, string> = {
  'loading-settings': 'Đang tải cài đặt…',
  'loading-runtime-config': 'Đang chuẩn bị kết nối…',
  'loading-assets': 'Đang tải giao diện…',
  'initializing-client': 'Đang khởi tạo ván chơi…',
};

export default function LoadingScreen({ stage }: { stage: Exclude<BootStage, 'ready' | 'error'> }) {
  return (
    <main className="app-screen app-screen--loading" role="status" aria-live="polite">
      <div className="app-screen__brand-mark" aria-hidden="true">OWN THE BLOCK</div>
      <p className="app-screen__product-name">Cờ Tỷ Phú Việt Nam</p>
      <span className="app-screen__spinner" aria-hidden="true" />
      <p>{stageMessages[stage]}</p>
    </main>
  );
}

