import { useContext } from 'react';
import type { PublicGameState, TradeBundle } from '@monopoly/shared';
import stateContext from '../../internal';
import {
  formatMoney,
  getMortgageTransferSurcharge,
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

function bundleMortgageSurcharge(state: PublicGameState, bundle: TradeBundle): number {
  return bundle.propertyIds.reduce((sum, tileId) => (
    sum + (state.boardState.ownedProps[tileId]?.mortgaged
      ? getMortgageTransferSurcharge(tileId)
      : 0)
  ), 0);
}

function describeMortgagedProperties(state: PublicGameState, bundle: TradeBundle): string | null {
  const properties = bundle.propertyIds
    .filter(tileId => state.boardState.ownedProps[tileId]?.mortgaged)
    .map(tileId => `${getTileName(tileId)} (${formatMoney(getMortgageTransferSurcharge(tileId))})`);
  return properties.length > 0 ? properties.join(', ') : null;
}

export default function IncomingOffers() {
  const { state } = useContext(stateContext);
  const { offers, acceptOffer, declineOffer } = useIncomingOffers();

  return (
    <Modal open={state.loaded && offers.length !== 0} title="Đề nghị giao dịch" className="open-market__offers-modal">
      {offers.map((current, index) => {
        const recipientSurcharge = bundleMortgageSurcharge(state, current.offered);
        const proposerSurcharge = bundleMortgageSurcharge(state, current.requested);
        const recipientMortgaged = describeMortgagedProperties(state, current.offered);
        const proposerMortgaged = describeMortgagedProperties(state, current.requested);

        return (
          <section key={current.offerId} className="open-market__offer">
            <h3 className="open-market__offer__title">
              {`Đề nghị từ ${current.proposerName}`}
            </h3>
            <p>{`Hết hạn sau: ${current.remainingSeconds} giây`}</p>
            <p>{`${current.proposerName} giao: ${describeBundle(current.offered)}`}</p>
            <p>{`Bạn giao: ${describeBundle(current.requested)}`}</p>
            {recipientSurcharge > 0 || proposerSurcharge > 0
              ? (
                <div className="trade-mortgage-note">
                  <strong>Phí nhận tài sản đang cầm cố</strong>
                  {recipientMortgaged
                    ? <p>Bạn trả {formatMoney(recipientSurcharge)}: {recipientMortgaged}.</p>
                    : <p>Bạn không phải trả phí cầm cố.</p>}
                  {proposerMortgaged
                    ? <p>{current.proposerName} trả {formatMoney(proposerSurcharge)}: {proposerMortgaged}.</p>
                    : <p>{current.proposerName} không phải trả phí cầm cố.</p>}
                  <p>Mỗi khoản bằng 10% giá trị cầm cố, nộp ngay cho Ngân hàng và tách khỏi tiền đổi giữa hai bên.</p>
                </div>
              )
              : null}
            <div className="open-market__offer__buttons">
              <Button
                data-modal-autofocus={index === 0 ? true : undefined}
                className="open-market__sell-toast__button--yes"
                onClick={() => acceptOffer(current)}
                type="button"
                disabled={current.remainingSeconds <= 0}
              >
                Chấp nhận
              </Button>
              <Button
                variant="secondary"
                className="open-market__sell-toast__button--no"
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
