import { useEffectiveReducedMotion } from '../../settings/selectors';
import type { BootStage } from '../bootstrap/types';
import { BrandLockup, MascotRow } from './ScreenBrand';
import './screens.css';

/** The bootstrap stages, plus `restoring` for a saved session that is being resumed inside the app. */
export type LoadingStage = Exclude<BootStage, 'ready' | 'error'> | 'restoring';

const stageMessages: Record<LoadingStage, string> = {
  'loading-settings': 'Đang tải cài đặt…',
  'loading-runtime-config': 'Đang chuẩn bị kết nối…',
  'loading-assets': 'Đang tải tài nguyên…',
  'initializing-client': 'Đang khởi tạo ván chơi…',
  restoring: 'Đang khôi phục ván chơi…',
};

interface LoadingScreenProps {
  stage: LoadingStage;
  /** `main` when the screen is the whole page (bootstrap); `section` inside the app shell, which already has a `main`. */
  as?: 'main' | 'section';
}

/**
 * The one loading screen: brand lockup, a row of mascots, what is happening and three progress dots. It renders before the
 * settings exist, so the still state follows the operating system, and the game setting once the provider is there.
 */
export default function LoadingScreen({ stage, as: Element = 'main' }: LoadingScreenProps) {
  const reducedMotion = useEffectiveReducedMotion();
  return (
    <Element className={`app-screen app-screen--loading${reducedMotion ? ' app-screen--still' : ''}`}>
      <BrandLockup />
      <MascotRow />
      <p className="app-screen__stage" role="status" aria-live="polite">{stageMessages[stage]}</p>
      <span className="app-screen__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </Element>
  );
}
