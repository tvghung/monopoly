import { useContext, type ReactNode } from 'react';
import type { TradeBundle } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import type { ActiveOffer } from './useIncomingOffers';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { buildDeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import './TradeOffer.css';

/** One side of an offer as a list of chips: each deed, the cash, and the Get Out Of Jail Free cards. */
function BundleSummary({ title, bundle }: { title: string; bundle: TradeBundle }) {
  const { state, roomPlayers } = useContext(stateContext);
  const empty = bundle.cash <= 0 && bundle.propertyIds.length === 0 && bundle.jailFreeCardIds.length === 0;
  return (
    <div className="trade-offers-modal__side" role="group" aria-label={title}>
      <p className="trade-offers-modal__side-title" aria-hidden="true">{title}</p>
      <ul className="trade-offers-modal__items">
        {bundle.propertyIds.map(tileId => {
          const model = buildDeedCardModel({ tileId, state, roomPlayers });
          return (
            <li key={tileId}>
              {model ? <PropertyDeedCard model={model} variant="chip" /> : <span>{getTileName(tileId)}</span>}
            </li>
          );
        })}
        {bundle.cash > 0
          ? <li><Chip tone="gold" icon={<ActionIcon name="cash" />}>{formatMoney(bundle.cash)}</Chip></li>
          : null}
        {bundle.jailFreeCardIds.length > 0
          ? <li><Chip tone="info" icon={<ActionIcon name="jailCard" />}>{`${bundle.jailFreeCardIds.length} thẻ Thoát Tù Miễn Phí`}</Chip></li>
          : null}
        {empty ? <li className="trade-offers-modal__none">Không có tài sản</li> : null}
      </ul>
    </div>
  );
}

interface OfferCardProps {
  offer: ActiveOffer;
  /** The first card of a dialog takes the initial focus. */
  autoFocus?: boolean;
  /** Replaces the default "Đề nghị từ <name>" headline. */
  title?: string;
  /** Extra lines under the terms, for example what the offer does to a debt. */
  notes?: ReactNode;
  /** Both buttons wait while an answer is on its way. */
  busy?: boolean;
  onAccept: (offer: ActiveOffer) => void;
  onDecline: (offer: ActiveOffer) => void;
}

/** A private trade offer you received: who sent it, what each side gives, the countdown, and Chấp nhận / Từ chối. */
export default function OfferCard({
  offer, autoFocus = false, title, notes, busy = false, onAccept, onDecline,
}: OfferCardProps) {
  const { state } = useContext(stateContext);
  const proposer = state.players[offer.proposerPlayerId];
  const expired = offer.remainingSeconds <= 0;
  const titleId = `incoming-offer-${offer.offerId}`;
  return (
    <section className="trade-offers-modal__offer" aria-labelledby={titleId}>
      <header className="trade-offers-modal__sender">
        {proposer
          ? <PlayerAvatar characterId={proposer.characterId ?? null} colorId={proposer.color} size={44} />
          : null}
        <h3 id={titleId} className="trade-offers-modal__offer__title">
          {title ?? `Đề nghị từ ${offer.proposerName}`}
        </h3>
        <Chip tone={offer.remainingSeconds <= 10 ? 'loss' : 'neutral'} icon={<ActionIcon name="clock" />}>
          {`Hết hạn sau: ${offer.remainingSeconds} giây`}
        </Chip>
      </header>
      <div className="trade-offers-modal__terms">
        <BundleSummary title={`${offer.proposerName} giao`} bundle={offer.offered} />
        <span className="trade-offers-modal__swap" aria-hidden="true"><ActionIcon name="trade" /></span>
        <BundleSummary title="Bạn giao" bundle={offer.requested} />
      </div>
      {notes}
      {expired ? <p className="trade-offers-modal__expired">Đề nghị đã hết hạn.</p> : null}
      <div className="trade-offers-modal__offer__buttons">
        <Button
          data-modal-autofocus={autoFocus ? true : undefined}
          aria-describedby={titleId}
          size="lg"
          icon={<ActionIcon name="accept" />}
          onClick={() => onAccept(offer)}
          disabled={expired || busy}
        >
          Chấp nhận
        </Button>
        <Button
          variant="secondary"
          aria-describedby={titleId}
          size="lg"
          icon={<ActionIcon name="decline" />}
          onClick={() => onDecline(offer)}
          disabled={expired || busy}
        >
          Từ chối
        </Button>
      </div>
    </section>
  );
}
