import { useContext, useEffect, useState } from 'react';
import type { Ack } from '@monopoly/shared';
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
  return (
    <Modal open title="Đề nghị bán bắt buộc" className="forced-sale-proposal">
      {error ? <p role="alert">{error}</p> : null}
      <p>{getTileName(proposal.tileID)}</p>
      <p>Giá giao dịch cố định: {formatMoney(proposal.grossPrice)}</p>
      {isSeller ? <p>Bạn nhận đủ giá giao dịch trước khi hàng đợi thanh toán tiếp tục xử lý khoản nợ.</p> : null}
      <p>Giá do máy chủ xác định; mức phát triển hiện tại được giữ nguyên.</p>
      {isBuyer
        ? (
          <div>
            <Button
              data-modal-autofocus
              type="button"
              busy={pendingAction === 'ACCEPT'}
              disabled={pendingAction !== null}
              onClick={() => submit('ACCEPT', () => socketFunctions.acceptForcedSale?.(proposal.proposalId))}
            >Chấp nhận</Button>
            <Button
              variant="secondary"
              type="button"
              busy={pendingAction === 'REJECT'}
              disabled={pendingAction !== null}
              onClick={() => submit('REJECT', () => socketFunctions.rejectForcedSale?.(proposal.proposalId))}
            >Từ chối</Button>
          </div>
        )
        : (
          <div>
            <p>Đang chờ người mua {state.players[proposal.buyerPlayerId]?.name ?? ''} phản hồi.</p>
            {isSeller
              ? (
                <Button
                  variant="secondary"
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
