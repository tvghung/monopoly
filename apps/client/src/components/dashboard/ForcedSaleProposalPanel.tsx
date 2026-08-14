import { useContext } from 'react';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';

export default function ForcedSaleProposalPanel() {
  const { privatePlayerState, playerId, canMutate, socketFunctions, state } = useContext(stateContext);
  const proposal = privatePlayerState?.forcedSaleProposal;
  if (!proposal || !canMutate || !playerId) return null;
  const isBuyer = proposal.buyerPlayerId === playerId;
  const isSeller = proposal.sellerPlayerId === playerId;
  if (!isBuyer && !isSeller) return null;
  return (
    <section className="forced-sale-proposal" role="dialog" aria-labelledby="forced-sale-title">
      <h3 id="forced-sale-title">Đề nghị bán bắt buộc</h3>
      <p>{`${getTileName(proposal.tileID)} — ${formatMoney(proposal.grossPrice)}`}</p>
      <p>Giá do máy chủ xác định; mức phát triển hiện tại được giữ nguyên.</p>
      {isBuyer
        ? (
          <div>
            <button type="button" onClick={() => socketFunctions.acceptForcedSale?.(proposal.proposalId)}>Chấp nhận</button>
            <button type="button" onClick={() => socketFunctions.rejectForcedSale?.(proposal.proposalId)}>Từ chối</button>
          </div>
        )
        : (
          <div>
            <p>Đang chờ người mua {state.players[proposal.buyerPlayerId]?.name ?? ''} phản hồi.</p>
            {isSeller
              ? <button type="button" onClick={() => socketFunctions.rejectForcedSale?.(proposal.proposalId)}>Hủy đề nghị</button>
              : null}
          </div>
        )}
    </section>
  );
}
