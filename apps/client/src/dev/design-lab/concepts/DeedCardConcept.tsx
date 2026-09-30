import { tileState } from '@monopoly/shared';
import MoneyText from '../../../design-system/components/MoneyText/MoneyText';
import { getPropertyGroupVisualStyle } from '../../../game/ui/propertyVisualColors';

const RENT_LABELS = ['1 nhà', '2 nhà', '3 nhà', '4 nhà', 'Khách sạn'] as const;

/** Concept-only deed card built from a real board tile; plan 04 builds the production card. */
export default function DeedCardConcept({ streetName = 'Đà Nẵng' }: { streetName?: string }) {
  const tile = tileState.find(candidate => candidate.streetName === streetName);
  if (!tile) return null;
  const style = getPropertyGroupVisualStyle(tile.color);
  return (
    <article className="lab-deed" aria-label={`Thẻ đất ${tile.streetName}`}>
      <header className="lab-deed__header" style={{ background: style.color, color: style.headerText }}>
        <small>{style.label}</small>
        <h3>{tile.streetName}</h3>
      </header>
      <dl className="lab-deed__rows">
        <div className="lab-deed__row lab-deed__row--base">
          <dt>Tiền thuê đất trống</dt>
          <dd><MoneyText amount={tile.rent ?? 0} /></dd>
        </div>
        {(tile.rentTiers ?? []).map((rent, index) => (
          <div key={RENT_LABELS[index]} className="lab-deed__row">
            <dt>{RENT_LABELS[index]}</dt>
            <dd><MoneyText amount={rent} size="sm" /></dd>
          </div>
        ))}
      </dl>
      <footer className="lab-deed__footer">
        <div>
          <small>Giá mua</small>
          <MoneyText amount={tile.price ?? 0} size="lg" />
        </div>
        <div>
          <small>Giá xây nhà</small>
          <MoneyText amount={tile.houseCost ?? 0} />
        </div>
      </footer>
    </article>
  );
}
