import { tileState } from '@monopoly/shared';
import Button from '../../../design-system/components/Button/Button';
import MoneyText from '../../../design-system/components/MoneyText/MoneyText';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import { getPropertyGroupVisualStyle } from '../../../game/ui/propertyVisualColors';
import DeedCardConcept from '../concepts/DeedCardConcept';
import { LabSection } from '../labKit';

const DISTRICTS = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue'] as const;

/** Concept: deed information plus two clear actions over a dimmed tabletop. */
export default function PurchaseConcept() {
  const tile = tileState.find(candidate => candidate.streetName === 'Đà Nẵng');
  const price = tile?.price ?? 0;
  const balance = 1_500;
  return (
    <LabSection
      id="purchase"
      title="6 · Screen concept: Purchase"
      note="Deed card and the two decisions. Plan 04 builds the production surface (a bottom sheet with the board not dimmed, OD-04-2)."
    >
      <div className="lab-stage" data-lab-stage="purchase">
        <div className="lab-stage__backdrop" aria-hidden="true">
          {DISTRICTS.map(group => (
            <span key={group} style={{ background: getPropertyGroupVisualStyle(group).color }} />
          ))}
        </div>
        <div className="lab-stage__dim" aria-hidden="true" />
        <div className="lab-purchase">
          <DeedCardConcept streetName="Đà Nẵng" />
          <div className="lab-purchase__decision">
            <p className="lab-purchase__question">Mua Đà Nẵng?</p>
            <p className="lab-purchase__balance">
              Bạn có <MoneyText amount={balance} size="sm" />, còn lại <MoneyText amount={balance - price} size="sm" /> sau khi mua.
            </p>
            <div className="lab-purchase__actions">
              <Button size="lg" icon={<ActionIcon name="buy" />}>Mua ngay</Button>
              <Button size="lg" variant="ghost" icon={<ActionIcon name="skip" />}>Bỏ qua</Button>
            </div>
          </div>
        </div>
      </div>
    </LabSection>
  );
}
