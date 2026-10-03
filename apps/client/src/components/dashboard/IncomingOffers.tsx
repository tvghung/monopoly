import { useContext } from 'react';
import stateContext from '../../internal';
import { useIncomingOffers } from './useIncomingOffers';
import OfferCard from './OfferCard';
import Modal from '../../design-system/components/Modal/Modal';
import './TradeOffer.css';

export default function IncomingOffers() {
  const { state, playerId } = useContext(stateContext);
  const { offers, acceptOffer, declineOffer } = useIncomingOffers();
  // A player in debt answers offers inside the debt dialog ("Cần thanh toán", DebtPanel). Only offers to buy the debtor's
  // properties can be accepted then, and a second dialog on the same layer would cover the first.
  const inDebt = state.boardState.paymentShortfall?.debtorPlayerId === playerId;

  return (
    <Modal open={state.loaded && !inDebt && offers.length !== 0} title="Đề nghị giao dịch" eyebrow="Giao dịch" size="lg" className="trade-offers-modal">
      {offers.map((current, index) => (
        <OfferCard
          key={current.offerId}
          offer={current}
          autoFocus={index === 0}
          onAccept={acceptOffer}
          onDecline={declineOffer}
        />
      ))}
    </Modal>
  );
}
