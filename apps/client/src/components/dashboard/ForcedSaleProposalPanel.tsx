import { useContext, useEffect, useMemo, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, localizeAckError } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { buildDeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import './ForcedSaleProposalPanel.css';

export default function ForcedSaleProposalPanel() {
  const {
    privatePlayerState, playerId, canMutate, socketFunctions, state, connected, roomPlayers,
  } = useContext(stateContext);
  const proposal = privatePlayerState?.forcedSaleProposal;
  const isBuyer = Boolean(proposal && proposal.buyerPlayerId === playerId);
  const isSeller = Boolean(proposal && proposal.sellerPlayerId === playerId);
  const visible = Boolean(proposal && canMutate && playerId && (isBuyer || isSeller));
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tileId = proposal?.tileID;
  const deed = useMemo(
    () => (visible && typeof tileId === 'number' ? buildDeedCardModel({ tileId, state, roomPlayers }) : null),
    [roomPlayers, state, tileId, visible],
  );

  useEffect(() => {
    setPendingAction(null);
    setError(null);
  }, [canMutate, connected, playerId, proposal?.proposalId, visible]);

  const submit = (action: string, command?: () => void | Promise<Ack>) => {
    if (pendingAction || !command) return;
    setPendingAction(action);
    setError(null);
    void Promise.resolve(command())
      .then(response => {
        if (!response || response.ok) return;
        setPendingAction(null);
        setError(localizeAckError(response.error));
      })
      .catch(() => {
        setPendingAction(null);
        setError('Không thể gửi thao tác. Vui lòng thử lại.');
      });
  };

  if (!visible || !proposal) return null;
  const buyer = state.players[proposal.buyerPlayerId];
  const seller = state.players[proposal.sellerPlayerId];
  const buyerName = buyer?.name ?? 'Người mua';
  const sellerName = seller?.name ?? 'Người bán';
  return (
    <Modal open title="Đề nghị bán bắt buộc" eyebrow="Thanh toán nợ" size="md" className="forced-sale-proposal">
      <div className="forced-sale-proposal__layout">
        {deed ? <PropertyDeedCard model={deed} variant="compact" showOwner={false} className="forced-sale-proposal__deed" /> : null}
        <div className="forced-sale-proposal__details">
          <dl className="forced-sale-proposal__facts">
            <div className="forced-sale-proposal__price">
              <dt>Giá cố định</dt>
              <dd>{formatMoney(proposal.grossPrice)}</dd>
            </div>
            <div className="forced-sale-proposal__party">
              <dt>Người bán</dt>
              <dd>
                {seller ? <span aria-hidden="true"><PlayerAvatar characterId={seller.characterId ?? null} colorId={seller.color} size={32} /></span> : null}
                {sellerName}
              </dd>
            </div>
            <div className="forced-sale-proposal__party">
              <dt>Người mua</dt>
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
                >Chấp nhận</Button>
                <Button
                  variant="secondary"
                  icon={<ActionIcon name="decline" />}
                  busy={pendingAction === 'REJECT'}
                  disabled={pendingAction !== null}
                  onClick={() => submit('REJECT', () => socketFunctions.rejectForcedSale?.(proposal.proposalId))}
                >Từ chối</Button>
              </div>
            )
            : (
              <div className="forced-sale-proposal__actions">
                <p className="forced-sale-proposal__status">Đang chờ {buyerName} phản hồi.</p>
                {isSeller
                  ? (
                    <Button
                      variant="secondary"
                      icon={<ActionIcon name="reject" />}
                      busy={pendingAction === 'CANCEL'}
                      disabled={pendingAction !== null}
                      onClick={() => submit('CANCEL', () => socketFunctions.rejectForcedSale?.(proposal.proposalId))}
                    >Hủy đề nghị</Button>
                  )
                  : null}
              </div>
            )}
        </div>
      </div>
    </Modal>
  );
}
