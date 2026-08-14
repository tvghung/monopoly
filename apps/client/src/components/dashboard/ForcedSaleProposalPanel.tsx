import { useContext } from 'react';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';

export default function ForcedSaleProposalPanel() {
  const { privatePlayerState, playerId, canMutate, socketFunctions, state } = useContext(stateContext);
  const proposal = privatePlayerState?.forcedSaleProposal;
  if (!proposal || !canMutate || !playerId) return null;
  const isBuyer = proposal.buyerPlayerId === playerId;
  const isSeller = proposal.sellerPlayerId === playerId;
  if (!isBuyer && !isSeller) return null;
  return (
    <Modal open title="Đề nghị bán bắt buộc" className="forced-sale-proposal">
      <p>{getTileName(proposal.tileID)}</p>
      <p>Giá giao dịch cố định: {formatMoney(proposal.grossPrice)}</p>
      {isSeller && proposal.sellerNetProceeds !== proposal.grossPrice
        ? <p>Bạn thực nhận sau khi trừ khoản thế chấp: {formatMoney(proposal.sellerNetProceeds)}</p>
        : null}
      <p>Giá do máy chủ xác định; mức phát triển hiện tại được giữ nguyên.</p>
      {isBuyer
        ? (
          <div>
            <Button data-modal-autofocus type="button" onClick={() => socketFunctions.acceptForcedSale?.(proposal.proposalId)}>Chấp nhận</Button>
            <Button variant="secondary" type="button" onClick={() => socketFunctions.rejectForcedSale?.(proposal.proposalId)}>Từ chối</Button>
          </div>
        )
        : (
          <div>
            <p>Đang chờ người mua {state.players[proposal.buyerPlayerId]?.name ?? ''} phản hồi.</p>
            {isSeller
              ? <Button variant="secondary" type="button" onClick={() => socketFunctions.rejectForcedSale?.(proposal.proposalId)}>Hủy đề nghị</Button>
              : null}
          </div>
        )}
    </Modal>
  );
}
