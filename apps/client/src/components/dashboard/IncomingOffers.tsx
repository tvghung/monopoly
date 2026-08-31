import { useContext } from 'react';
import type { TradeBundle } from '@monopoly/shared';
import { Check, X } from 'lucide-react';
import stateContext from '../../internal';
import {
  formatMoney,
  getTileName,
} from '../../presentation';
import { useIncomingOffers } from './useIncomingOffers';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';

function describeBundle(bundle: TradeBundle): string {
  const parts = [
    bundle.cash > 0 ? formatMoney(bundle.cash) : null,
    ...bundle.propertyIds.map(getTileName),
    bundle.jailFreeCardIds.length > 0
      ? `${bundle.jailFreeCardIds.length} thẻ Thoát Tù Miễn Phí`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.join(', ') || 'không có tài sản';
}

export default function IncomingOffers() {
  const { state } = useContext(stateContext);
  const { offers, acceptOffer, declineOffer } = useIncomingOffers();

  return (
    <Modal open={state.loaded && offers.length !== 0} title="Đề nghị giao dịch" className="trade-offers-modal">
      {offers.map((current, index) => {
        return (
          <section key={current.offerId} className="trade-offers-modal__offer">
            <h3 className="trade-offers-modal__offer__title">
              {`Đề nghị từ ${current.proposerName}`}
            </h3>
            <p>{`Hết hạn sau: ${current.remainingSeconds} giây`}</p>
            <p>{`${current.proposerName} giao: ${describeBundle(current.offered)}`}</p>
            <p>{`Bạn giao: ${describeBundle(current.requested)}`}</p>
            <div className="trade-offers-modal__offer__buttons">
              <Button
                data-modal-autofocus={index === 0 ? true : undefined}
                icon={<Check />}
                className="trade-offers-modal__button--yes"
                onClick={() => acceptOffer(current)}
                type="button"
                disabled={current.remainingSeconds <= 0}
              >
                Chấp nhận
              </Button>
              <Button
                variant="secondary"
                icon={<X />}
                className="trade-offers-modal__button--no"
                onClick={() => declineOffer(current)}
                type="button"
                disabled={current.remainingSeconds <= 0}
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
