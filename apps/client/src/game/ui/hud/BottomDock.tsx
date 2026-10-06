import type { ReactNode } from 'react';
import DebtPanel from '../../../components/dashboard/DebtPanel';
import JailPanel from '../../../components/dashboard/JailPanel';
import RevivePanel from '../../../components/dashboard/RevivePanel';
import OwnedPropertiesControl from '../property/OwnedPropertiesControl';

/**
 * The bottom-center column of the HUD, top to bottom: the context stack (the jail panel and the debt status, whose
 * contents are restyled with the other decision panels) and the action dock ("Tài sản của tôi"). Both are inside the
 * inert game board like every other gameplay control. The activity ticker sits above the context stack.
 */
export default function BottomDock({ onSelectTile, ticker }: { onSelectTile: (tileId: number) => void; ticker?: ReactNode }) {
  return (
    <div className="hud-bottom">
      {ticker}
      <div className="hud-context" data-hud-region="context-stack" data-hud-transient="true">
        <DebtPanel />
        <JailPanel />
        <RevivePanel />
      </div>
      <nav className="action-dock" data-hud-region="action-dock" aria-label="Thao tác nhanh">
        <OwnedPropertiesControl onSelect={onSelectTile} />
      </nav>
    </div>
  );
}
