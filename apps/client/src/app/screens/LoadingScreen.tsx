import type { BootStage } from '../bootstrap/types';
import type { BootstrapProgress } from '../bootstrap/types';
import './screens.css';

const stageMessages: Record<Exclude<BootStage, 'ready' | 'error'>, string> = {
  'loading-settings': 'Đang tải cài đặt…',
  'loading-runtime-config': 'Đang chuẩn bị kết nối…',
  'loading-assets': 'Đang tải giao diện…',
  'initializing-client': 'Đang khởi tạo ván chơi…',
};

interface LoadingScreenProps {
  stage?: Exclude<BootStage, 'ready' | 'error'>;
  message?: string;
  progress?: Pick<BootstrapProgress, 'loaded' | 'total' | 'failed' | 'currentAssetLabel'>;
}

export default function LoadingScreen({ stage, message, progress }: LoadingScreenProps) {
  const stageMessage = message ?? (stage ? stageMessages[stage] : 'Đang chuẩn bị trò chơi…');
  const measurable = Boolean(progress && progress.total > 0);
  const loaded = Math.min(progress?.loaded ?? 0, progress?.total ?? 0);

  return (
    <section className="app-screen app-screen--loading" role="status" aria-live="polite" aria-busy="true">
      <div className="app-screen__content">
        <p className="app-screen__brand-mark" aria-hidden="true">OWN THE BLOCK</p>
        <p className="app-screen__product-name">Cờ Tỷ Phú Việt Nam</p>
        <p className="app-screen__stage">{stageMessage}</p>
        {measurable
          ? (
            <div className="app-screen__progress-wrap">
              <div className="app-screen__progress-row">
                <progress
                  className="app-screen__progress"
                  value={loaded}
                  max={progress?.total}
                  aria-label="Tiến độ tải tài nguyên"
                />
                <span className="app-screen__progress-count">{loaded} / {progress?.total}</span>
              </div>
              {progress?.currentAssetLabel
                ? <p className="app-screen__asset-label">{progress.currentAssetLabel}</p>
                : null}
            </div>
          )
          : <span className="app-screen__loading-signal" aria-hidden="true"><i /><i /><i /></span>}
      </div>
    </section>
  );
}

