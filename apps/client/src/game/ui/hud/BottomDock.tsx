import type { ReactNode } from 'react';
import DebtPanel from '../../../components/dashboard/DebtPanel';
import JailPanel from '../../../components/dashboard/JailPanel';
import RevivePanel from '../../../components/dashboard/RevivePanel';
import OwnedPropertiesControl from '../property/OwnedPropertiesControl';
import CameraControls from './CameraControls';
import { NARROW_HUD_QUERY, useMediaQuery } from '../../../design-system/useMediaQuery';
import { useTranslation } from '../../../i18n/I18n';

/**
 * The bottom-center column of the HUD, top to bottom: the context stack (the jail panel and the debt status, whose
 * contents are restyled with the other decision panels; in a narrow window the jail panel is in the center stage instead, under
 * the roll button) and the action dock ("Tài sản của tôi"). Both are inside the
 * inert game board like every other gameplay control. The activity ticker sits above the context stack.
 */
export default function BottomDock({ onSelectTile, ticker }: { onSelectTile: (tileId: number) => void; ticker?: ReactNode }) {
  const { t } = useTranslation();
  const narrow = useMediaQuery(NARROW_HUD_QUERY);
  return (
    <div className="hud-bottom">
      {ticker}
      <div className="hud-context" data-hud-region="context-stack" data-hud-transient="true">
        <DebtPanel />
        {narrow ? null : <JailPanel />}
        <RevivePanel />
      </div>
      <nav className="action-dock" data-hud-region="action-dock" aria-label={t('hud.actions')}>
        <OwnedPropertiesControl onSelect={onSelectTile} />
        <CameraControls />
      </nav>
    </div>
  );
}
