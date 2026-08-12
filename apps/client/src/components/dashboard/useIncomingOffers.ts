import { useContext, useEffect, useMemo, useState } from 'react';
import type { PrivateOffer } from '@monopoly/shared';
import stateContext from '../../internal';

export type ActiveOffer = PrivateOffer & { remainingSeconds: number };

export function useIncomingOffers() {
  const {
    privateOffers, playerId, socketFunctions,
  } = useContext(stateContext);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (privateOffers.length === 0) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [privateOffers.length]);

  const offers = useMemo<ActiveOffer[]>(() => privateOffers
    .filter(offer => offer.recipientPlayerId === playerId && offer.status === 'PENDING')
    .map(offer => ({
      ...offer,
      remainingSeconds: Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - now) / 1000)),
    })), [now, playerId, privateOffers]);

  return {
    offers,
    acceptOffer: (offer: ActiveOffer) => socketFunctions.acceptOffer(offer.offerId),
    declineOffer: (offer: ActiveOffer) => socketFunctions.declineOffer(offer.offerId),
  };
}
