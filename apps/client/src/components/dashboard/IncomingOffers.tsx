import { useContext } from 'react';
import type { TradeBundle } from '@monopoly/shared';
import stateContext from '../../internal';
import {
  formatMoney,
  getTileName,
} from '../../presentation';
import { useIncomingOffers } from './useIncomingOffers';
import Modal from '../../design-system/components/Modal/Modal';
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

export default function IncomingOffers() {
  const { state } = useContext(stateContext);
  const { offers, acceptOffer, declineOffer } = useIncomingOffers();

  return (
    <Modal open={state.loaded && offers.length !== 0} title="Đề nghị giao dịch" eyebrow="Giao dịch" size="lg" className="trade-offers-modal">
      {offers.map((current, index) => {
        const proposer = state.players[current.proposerPlayerId];
        const expired = current.remainingSeconds <= 0;
        const titleId = `incoming-offer-${current.offerId}`;
        return (
          <section key={current.offerId} className="trade-offers-modal__offer" aria-labelledby={titleId}>
            <header className="trade-offers-modal__sender">
              {proposer
                ? <PlayerAvatar characterId={proposer.characterId ?? null} colorId={proposer.color} size={44} />
                : null}
              <h3 id={titleId} className="trade-offers-modal__offer__title">
                {`Đề nghị từ ${current.proposerName}`}
              </h3>
              <Chip tone={current.remainingSeconds <= 10 ? 'loss' : 'neutral'} icon={<ActionIcon name="clock" />}>
                {`Hết hạn sau: ${current.remainingSeconds} giây`}
              </Chip>
            </header>
            <div className="trade-offers-modal__terms">
              <BundleSummary title={`${current.proposerName} giao`} bundle={current.offered} />
              <span className="trade-offers-modal__swap" aria-hidden="true"><ActionIcon name="trade" /></span>
              <BundleSummary title="Bạn giao" bundle={current.requested} />
            </div>
            {expired ? <p className="trade-offers-modal__expired">Đề nghị đã hết hạn.</p> : null}
            <div className="trade-offers-modal__offer__buttons">
              <Button
                data-modal-autofocus={index === 0 ? true : undefined}
                aria-describedby={titleId}
                size="lg"
                icon={<ActionIcon name="accept" />}
                onClick={() => acceptOffer(current)}
                disabled={expired}
              >
                Chấp nhận
              </Button>
              <Button
                variant="secondary"
                aria-describedby={titleId}
                size="lg"
                icon={<ActionIcon name="decline" />}
                onClick={() => declineOffer(current)}
                disabled={expired}
              >
                Từ chối
              </Button>
            </div>
          </section>
        );
      })}
    </Modal>
  );
}
