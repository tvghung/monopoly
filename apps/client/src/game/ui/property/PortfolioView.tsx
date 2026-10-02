import { useContext, useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import Button from '../../../design-system/components/Button/Button';
import Chip from '../../../design-system/components/Chip/Chip';
import MoneyText from '../../../design-system/components/MoneyText/MoneyText';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import stateContext from '../../../internal';
import { buildDeedCardModel, type DeedCardModel } from './deedCardModel';
import { buildPortfolioModel, type PortfolioGroup } from './portfolioModel';
import PropertyDeedCard from './PropertyDeedCard';
import './PortfolioView.css';

/** The authoritative balance of the player whose portfolio is shown. */
export function PortfolioBalance({ amount }: { amount: number }) {
  return (
    <p className="portfolio-summary__balance">
      <span className="portfolio-summary__label">Số dư hiện tại</span>
      <MoneyText amount={amount} size="lg" />
    </p>
  );
}

function GroupSection({
  group, deeds, onInspect,
}: {
  group: PortfolioGroup;
  deeds: ReadonlyMap<number, DeedCardModel>;
  onInspect?: (tileId: number) => void;
}) {
  const labelId = useId();
  return (
    <div
      className="portfolio-group"
      role="group"
      aria-labelledby={labelId}
      style={{ '--portfolio-group-color': group.color } as CSSProperties}
    >
      <div className="portfolio-group__header">
        <span className="portfolio-group__swatch" aria-hidden="true" />
        <p id={labelId} className="portfolio-group__label">{group.label}</p>
        <span className="portfolio-group__count">{`${group.tileIds.length}/${group.total} ô`}</span>
        {group.complete ? <Chip tone="gold" icon={<ActionIcon name="crown" />}>Đủ nhóm</Chip> : null}
      </div>
      {/* role="list" keeps the list semantics in WebKit, which drops them when list-style is none. */}
      <ul className="portfolio-group__cards" role="list">
        {group.tileIds.map(tileId => {
          const deed = deeds.get(tileId);
          if (!deed) return null;
          return (
            <li key={tileId} className="portfolio-card owned-properties-list__item">
              <PropertyDeedCard model={deed} variant="compact" showOwner={false} />
              {onInspect ? (
                <Button
                  variant="ghost"
                  icon={<ActionIcon name="view" />}
                  className="portfolio-card__inspect"
                  aria-label={`Xem ${deed.name}`}
                  onClick={() => onInspect(tileId)}
                >
                  Xem
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface PortfolioViewProps {
  ownerId: string;
  /** The top-left of the summary: the balance for one's own portfolio, avatar, name and balance (or status) for another's. */
  lead: ReactNode;
  emptyText: string;
  /** Opens one property in the inspection dialog; without it the deeds are shown without a button. */
  onInspect?: (tileId: number) => void;
}

/**
 * The portfolio of one player, read from authoritative state: a summary (the `lead` plus tài sản / nhà / khách sạn
 * counts) and the owned deeds as compact cards grouped by district. "Tài sản của tôi" and the player portfolio share it.
 */
export default function PortfolioView({
  ownerId, lead, emptyText, onInspect,
}: PortfolioViewProps) {
  const { state, roomPlayers } = useContext(stateContext);
  const portfolio = useMemo(() => buildPortfolioModel(state, ownerId), [ownerId, state]);
  const deeds = useMemo(() => {
    const models = new Map<number, DeedCardModel>();
    portfolio.groups.forEach(group => group.tileIds.forEach(tileId => {
      const model = buildDeedCardModel({ tileId, state, roomPlayers });
      if (model) models.set(tileId, model);
    }));
    return models;
  }, [portfolio, roomPlayers, state]);

  return (
    <div className="portfolio">
      <div className="portfolio-summary">
        <div className="portfolio-summary__lead">{lead}</div>
        <ul className="portfolio-summary__counts" role="list" aria-label="Tổng quan tài sản">
          <li><Chip icon={<ActionIcon name="buildHotel" />}>{`${portfolio.properties} tài sản`}</Chip></li>
          <li><Chip icon={<ActionIcon name="house" />}>{`${portfolio.houses} nhà`}</Chip></li>
          <li><Chip icon={<ActionIcon name="hotel" />}>{`${portfolio.hotels} khách sạn`}</Chip></li>
        </ul>
      </div>
      {portfolio.groups.length > 0
        ? portfolio.groups.map(group => (
          <GroupSection key={group.key} group={group} deeds={deeds} onInspect={onInspect} />
        ))
        : <p className="portfolio__empty">{emptyText}</p>}
    </div>
  );
}
