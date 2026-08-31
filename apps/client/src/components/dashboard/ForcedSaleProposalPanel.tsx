import { useContext, useEffect, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import { Check, CircleX, X } from 'lucide-react';
import stateContext from '../../internal';
import { formatMoney, getTileName, localizeAckError } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';

export default function ForcedSaleProposalPanel() {
  const {
    privatePlayerState, playerId, canMutate, socketFunctions, state, connected,
  } = useContext(stateContext);
  const proposal = privatePlayerState?.forcedSaleProposal;
  const isBuyer = Boolean(proposal && proposal.buyerPlayerId === playerId);
  const isSeller = Boolean(proposal && proposal.sellerPlayerId === playerId);
  const visible = Boolean(proposal && canMutate && playerId && (isBuyer || isSeller));
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const buyerName = state.players[proposal.buyerPlayerId]?.name ?? 'Người mua';
  const sellerName = state.players[proposal.sellerPlayerId]?.name ?? 'Người bán';
  return (
    <Modal open title="Đề nghị bán bắt buộc" className="forced-sale-proposal">
      {error ? <p role="alert">{error}</p> : null}
      <p className="forced-sale-proposal__property"><strong>{getTileName(proposal.tileID)}</strong></p>
      <dl className="forced-sale-proposal__facts">
        <div><dt>Giá cố định</dt><dd>{formatMoney(proposal.grossPrice)}</dd></div>
        <div><dt>Người bán</dt><dd>{sellerName}</dd></div>
        <div><dt>Người mua</dt><dd>{buyerName}</dd></div>
      </dl>
      {isBuyer
        ? (
          <div className="forced-sale-proposal__actions">
            <Button
              data-modal-autofocus
              type="button"
              icon={<Check />}
              busy={pendingAction === 'ACCEPT'}
              disabled={pendingAction !== null}
              onClick={() => submit('ACCEPT', () => socketFunctions.acceptForcedSale?.(proposal.proposalId))}
            >Chấp nhận</Button>
            <Button
              variant="secondary"
              icon={<X />}
              type="button"
              busy={pendingAction === 'REJECT'}
              disabled={pendingAction !== null}
              onClick={() => submit('REJECT', () => socketFunctions.rejectForcedSale?.(proposal.proposalId))}
            >Từ chối</Button>
          </div>
        )
        : (
          <div>
            <p>Đang chờ {buyerName} phản hồi.</p>
            {isSeller
              ? (
                <Button
                  variant="secondary"
                  icon={<CircleX />}
                  type="button"
                  busy={pendingAction === 'CANCEL'}
                  disabled={pendingAction !== null}
                  onClick={() => submit('CANCEL', () => socketFunctions.rejectForcedSale?.(proposal.proposalId))}
                >Hủy đề nghị</Button>
              )
              : null}
          </div>
        )}
    </Modal>
  );
}
