import { useContext, useEffect, useState } from 'react';
import type { OfferOnProp, OfferResult } from '@monopoly/shared';
import stateContext from '../../internal';
import { useToast } from '../Toast';

export type ActiveOffer = OfferOnProp & { timer: number };

// Owns the list of pending buy offers shown to a property owner: it ticks each
// offer's countdown, listens for server offer events (arrivals, and toasts for
// the buyer when their own offer is accepted/declined), and exposes accept /
// decline actions that forward to the server and drop the offer locally.
export function useIncomingOffers() {
  const { socket, socketFunctions } = useContext(stateContext);
  const toast = useToast();
  const [offers, setOffers] = useState<ActiveOffer[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffers(prev => prev
        .map(item => ({ ...item, timer: item.timer - 1 }))
        .filter(item => item.timer !== 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onOffer = (info: OfferOnProp) => {
      setOffers(prev => [...prev, { ...info, timer: 20 }]);
    };

    const onDeclined = (info: OfferResult) => {
      const { tileName, price, ownerName } = info;
      toast.show(`${ownerName} declined your offer to buy ${tileName} for $${price}M`);
    };

    const onAccepted = (info: OfferResult) => {
      const { tileName, price, ownerName } = info;
      toast.show(`${ownerName} accepted your offer to buy ${tileName} for $${price}M`);
    };

    socket.on('offer on prop', onOffer);
    socket.on('offer declined', onDeclined);
    socket.on('offer accepted', onAccepted);

    return () => {
      socket.off('offer on prop', onOffer);
      socket.off('offer declined', onDeclined);
      socket.off('offer accepted', onAccepted);
    };
  }, [socket, toast]);

  const acceptOffer = (chosen: ActiveOffer) => {
    setOffers(prev => prev.filter(item => item.tileID !== chosen.tileID));
    socketFunctions.acceptOffer(chosen);
  };

  const declineOffer = (chosen: ActiveOffer) => {
    setOffers(prev => prev.filter(item => item.tileID !== chosen.tileID));
    socketFunctions.declineOffer(chosen);
  };

  return { offers, acceptOffer, declineOffer };
}
