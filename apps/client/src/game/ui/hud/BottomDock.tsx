import type { ReactNode } from 'react';
import DebtPanel from '../../../components/dashboard/DebtPanel';
import RevivePanel from '../../../components/dashboard/RevivePanel';
import OwnedPropertiesControl from '../property/OwnedPropertiesControl';
import CameraControls from './CameraControls';
import { useTranslation } from '../../../i18n/I18n';

/**
 * The bottom column of the HUD, top to bottom: the context stack (the debt status and the 2v2 revive offer, restyled with the
 * other decision panels; the jail panel is in the center stage, under the roll button) and the action dock ("Tài sản của tôi" and
 * the camera keys). Both are inside the inert game board like every other gameplay control. The activity ticker sits above the
 * context stack.
 */
export default function BottomDock({ onSelectTile, ticker }: { onSelectTile: (tileId: number) => void; ticker?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="hud-bottom">
      {ticker}
      <div className="hud-context" data-hud-region="context-stack" data-hud-transient="true">
        <DebtPanel />
        <RevivePanel />
      </div>
      <nav className="action-dock" data-hud-region="action-dock" aria-label={t('hud.actions')}>
        <OwnedPropertiesControl onSelect={onSelectTile} />
        <CameraControls />
      </nav>
    </div>
  );
}
