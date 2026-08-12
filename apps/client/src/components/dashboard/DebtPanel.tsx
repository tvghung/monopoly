import { useContext, useEffect, useState } from 'react';
import type { DebtSource } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';

function describeDebtSource(source: DebtSource): string {
  switch (source.kind) {
    case 'RENT':
      return `tiền thuê tại ${getTileName(source.tileID)}`;
    case 'TAX':
      return `thuế tại ${getTileName(source.tileID)}`;
    case 'CARD':
      return 'khoản thanh toán từ thẻ';
    case 'BAIL':
      return 'tiền bảo lãnh ra tù';
    case 'MORTGAGE_INTEREST':
      return `lãi cầm cố của ${getTileName(source.tileID)}`;
    case 'OTHER':
      return 'khoản thanh toán bắt buộc';
    default:
      return 'khoản thanh toán bắt buộc';
  }
}

export default function DebtPanel() {
  const {
    state, playerId, canMutate, socketFunctions,
  } = useContext(stateContext);
  const [now, setNow] = useState(() => Date.now());
  const claim = state.boardState.paymentQueue;
  const paymentKey = claim
    ? `${claim.debtorPlayerId}:${claim.actionDeadlineAt}`
    : undefined;

  useEffect(() => {
    if (!paymentKey) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [paymentKey]);

  if (!state.loaded || !claim) return null;

  const debtor = state.players[claim.debtorPlayerId];
  const creditorName = claim.creditor === 'BANK'
    ? 'Ngân hàng'
    : state.players[claim.creditorPlayerId ?? '']?.name ?? 'người chơi khác';
  const remainingSeconds = Math.max(
    0,
    Math.ceil((Date.parse(claim.actionDeadlineAt) - now) / 1000),
  );
  const isMyDebt = claim.debtorPlayerId === playerId;
  const canPay = isMyDebt
    && canMutate
    && (debtor?.accountBalance ?? 0) >= claim.remainingAmount;

  return (
    <section className="debt-panel" role="alert" aria-labelledby="debt-panel-title">
      <h3 id="debt-panel-title" className="debt-panel__title">Khoản nợ đang chờ xử lý</h3>
      <p>
        <strong>{debtor?.name ?? 'Người chơi'}</strong>
        {` cần trả ${formatMoney(claim.remainingAmount)} cho ${creditorName} (${describeDebtSource(claim.source)}).`}
      </p>
      <p>{`Còn ${remainingSeconds} giây để huy động tài sản hoặc thanh toán.`}</p>
      {isMyDebt
        ? (
          <div className="debt-panel__actions">
            <button
              className="button__purchase--yes"
              type="button"
              disabled={!canPay}
              title={canPay ? 'Thanh toán khoản nợ này' : 'Hãy bán Nhà hoặc cầm cố tài sản để đủ tiền'}
              onClick={() => socketFunctions.settleDebt()}
            >
              Thanh toán ngay
            </button>
            <button
              className="button__purchase--no"
              type="button"
              disabled={!canMutate}
              onClick={() => {
                if (window.confirm('Tuyên bố phá sản sẽ kết thúc ván chơi của bạn. Bạn có chắc muốn tiếp tục?')) {
                  socketFunctions.declareBankruptcy();
                }
              }}
            >
              Tuyên bố phá sản
            </button>
          </div>
        )
        : null}
    </section>
  );
}
