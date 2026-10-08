import { useContext, useEffect, useMemo, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { buildDeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import './ForcedSaleProposalPanel.css';
import { useTranslation } from '../../i18n/I18n';
import { useLocalizedError } from '../../i18n/useLocalizedError';

export default function ForcedSaleProposalPanel() {
  const { language, t } = useTranslation();
  const {
    privatePlayerState, playerId, canMutate, socketFunctions, state, connected, roomPlayers,
  } = useContext(stateContext);
  const proposal = privatePlayerState?.forcedSaleProposal;
  const isBuyer = Boolean(proposal && proposal.buyerPlayerId === playerId);
  const isSeller = Boolean(proposal && proposal.sellerPlayerId === playerId);
  const visible = Boolean(proposal && canMutate && playerId && (isBuyer || isSeller));
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { error, clearError, setErrorKey, setAckError } = useLocalizedError();
  const tileId = proposal?.tileID;
  const deed = useMemo(
    () => (visible && typeof tileId === 'number' ? buildDeedCardModel({ tileId, state, roomPlayers, language }) : null),
    [language, roomPlayers, state, tileId, visible],
  );

  useEffect(() => {
    setPendingAction(null);
    clearError();
  }, [canMutate, clearError, connected, playerId, proposal?.proposalId, visible]);

  const submit = (action: string, command?: () => void | Promise<Ack>) => {
    if (pendingAction || !command) return;
    setPendingAction(action);
    clearError();
    void Promise.resolve(command())
      .then(response => {
        if (!response || response.ok) return;
        setPendingAction(null);
        setAckError(response.error);
      })
      .catch(() => {
        setPendingAction(null);
        setErrorKey('forcedSale.failed');
      });
  };

  if (!visible || !proposal) return null;
  const buyer = state.players[proposal.buyerPlayerId];
  const seller = state.players[proposal.sellerPlayerId];
  const buyerName = buyer?.name ?? t('forcedSale.buyer');
  const sellerName = seller?.name ?? t('forcedSale.seller');
  return (
    <Modal open title={t('forcedSale.title')} eyebrow={t('forcedSale.eyebrow')} size="md" peek="decision" peekKey={proposal.proposalId} className="forced-sale-proposal">
      <div className="forced-sale-proposal__layout">
        {deed ? <PropertyDeedCard model={deed} variant="compact" showOwner={false} className="forced-sale-proposal__deed" /> : null}
        <div className="forced-sale-proposal__details">
          <dl className="forced-sale-proposal__facts">
            <div className="forced-sale-proposal__price">
              <dt>{t('forcedSale.price')}</dt>
              <dd>{formatMoney(proposal.grossPrice)}</dd>
            </div>
            <div className="forced-sale-proposal__party">
              <dt>{t('forcedSale.seller')}</dt>
              <dd>
                {seller ? <span aria-hidden="true"><PlayerAvatar characterId={seller.characterId ?? null} colorId={seller.color} size={32} /></span> : null}
                {sellerName}
              </dd>
            </div>
            <div className="forced-sale-proposal__party">
              <dt>{t('forcedSale.buyer')}</dt>
              <dd>
                {buyer ? <span aria-hidden="true"><PlayerAvatar characterId={buyer.characterId ?? null} colorId={buyer.color} size={32} /></span> : null}
                {buyerName}
              </dd>
            </div>
          </dl>
          {error ? <p className="forced-sale-proposal__error" role="alert">{error}</p> : null}
          {isBuyer
            ? (
              <div className="forced-sale-proposal__actions">
                <Button
                  data-modal-autofocus
                  size="lg"
                  icon={<ActionIcon name="accept" />}
                  busy={pendingAction === 'ACCEPT'}
                  disabled={pendingAction !== null}
                  onClick={() => submit('ACCEPT', () => socketFunctions.acceptForcedSale?.(proposal.proposalId))}
                >{t('forcedSale.accept')}</Button>
                <Button
                  variant="secondary"
                  icon={<ActionIcon name="decline" />}
                  busy={pendingAction === 'REJECT'}
                  disabled={pendingAction !== null}
                  onClick={() => submit('REJECT', () => socketFunctions.rejectForcedSale?.(proposal.proposalId))}
                >{t('forcedSale.decline')}</Button>
              </div>
            )
            : (
              <div className="forced-sale-proposal__actions">
                <p className="forced-sale-proposal__status">{t('forcedSale.waiting', { name: buyerName })}</p>
                {isSeller
                  ? (
                    <Button
                      variant="secondary"
                      icon={<ActionIcon name="reject" />}
                      busy={pendingAction === 'CANCEL'}
                      disabled={pendingAction !== null}
                      onClick={() => submit('CANCEL', () => socketFunctions.rejectForcedSale?.(proposal.proposalId))}
                    >{t('forcedSale.cancel')}</Button>
                  )
                  : null}
              </div>
            )}
        </div>
      </div>
    </Modal>
  );
}
