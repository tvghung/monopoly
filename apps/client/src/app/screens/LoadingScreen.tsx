import HowToPlayButton from '../../howToPlay/HowToPlayButton';
import { useEffectiveReducedMotion } from '../../settings/selectors';
import type { BootStage } from '../bootstrap/types';
import { BrandLockup, MascotRow } from './ScreenBrand';
import './screens.css';
import { useTranslation } from '../../i18n/I18n';

/** The bootstrap stages, plus `restoring` for a saved session that is being resumed inside the app. */
export type LoadingStage = Exclude<BootStage, 'ready' | 'error'> | 'restoring';

const stageMessages: Record<LoadingStage, 'bootstrap.loadingSettings' | 'bootstrap.loadingRuntime' | 'bootstrap.loadingAssets' | 'bootstrap.initializing' | 'bootstrap.restoring'> = {
  'loading-settings': 'bootstrap.loadingSettings',
  'loading-runtime-config': 'bootstrap.loadingRuntime',
  'loading-assets': 'bootstrap.loadingAssets',
  'initializing-client': 'bootstrap.initializing',
  restoring: 'bootstrap.restoring',
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
  const { t } = useTranslation();
  return (
    <Element className={`app-screen app-screen--loading${reducedMotion ? ' app-screen--still' : ''}`}>
      <BrandLockup />
      <MascotRow />
      <p className="app-screen__stage" role="status" aria-live="polite">{t(stageMessages[stage])}</p>
      <span className="app-screen__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <HowToPlayButton placement="corner" />
    </Element>
  );
}
