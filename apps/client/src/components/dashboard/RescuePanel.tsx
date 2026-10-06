import { useContext, useEffect, useId, useState } from 'react';
import type { Ack, EmergencyRescueOffer, PublicGameState } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, localizeAckError } from '../../presentation';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import Modal from '../../design-system/components/Modal/Modal';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { formatCountdown, useCountdownSeconds } from '../../game/ui/hud/useCountdown';
import { selectRescueOffer } from '../../game/team/teamView';
import './DebtPanel.css';

type DebtClaim = NonNullable<PublicGameState['boardState']['paymentShortfall']>;

/** Copy shared with the tests: what the rescuer is told will happen when they decline or the offer runs out. */
export const RESCUE_DECLINE_CONSEQUENCE = 'Nếu bạn không hỗ trợ, đồng đội sẽ phá sản.';

type RescueAnswer = 'ACCEPT' | 'DECLINE';

/**
 * Emergency Rescue (2v2). The debtor has nothing left to sell, so the debt's open window belongs to the one active teammate who
 * can cover it: they pay the creditor directly, never the debtor's wallet. The rescuer gets a dialog; everyone else, including the
 * debtor, sees who is deciding and for how long. The server owns the deadline and the amount; this only displays them and sends
 * the offer id back.
 */
export default function RescuePanel({ claim, offer }: { claim: DebtClaim; offer: EmergencyRescueOffer }) {
  const {
    state, playerId, canMutate, connected, socketFunctions,
  } = useContext(stateContext);
  const descriptionId = useId();
  const [pending, setPending] = useState<RescueAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seconds = useCountdownSeconds(offer.expiresAt);
  const debtor = state.players[offer.debtorPlayerId];
  const rescuer = state.players[offer.rescuerPlayerId];
  const creditorPlayer = claim.creditor === 'BANK' ? undefined : state.players[claim.creditorPlayerId ?? ''];
  const creditorName = claim.creditor === 'BANK' ? 'Ngân hàng' : creditorPlayer?.name ?? 'người chơi khác';
  const debtorName = debtor?.name ?? 'Đồng đội';
  const rescuerName = rescuer?.name ?? 'đồng đội';
  const countdown = seconds === null ? '' : formatCountdown(seconds);
  const isRescuer = selectRescueOffer(state, playerId)?.rescueId === offer.rescueId;

  // A new offer (or losing the connection) starts the dialog over; the buttons never stay stuck on a stale answer.
  useEffect(() => {
    setPending(null);
    setError(null);
  }, [offer.rescueId, canMutate, connected]);

  const answer = (choice: RescueAnswer) => {
    if (pending) return;
    const command = choice === 'ACCEPT' ? socketFunctions.acceptRescue : socketFunctions.declineRescue;
    if (!command) return;
    setPending(choice);
    setError(null);
    void (async () => {
      try {
        const response: void | Ack = await command(offer.rescueId);
        if (response && !response.ok) {
          setPending(null);
          setError(localizeAckError(response.error));
        }
      } catch {
        setPending(null);
        setError('Không thể gửi thao tác. Vui lòng thử lại.');
      }
    })();
  };

  if (!isRescuer || !canMutate) {
    const waitingOnMe = playerId === offer.debtorPlayerId;
    return (
      <section className="debt-panel debt-panel--status debt-panel--rescue" data-rescue-id={offer.rescueId}>
        <div className="debt-panel__status-copy" role="status">
          <strong>
            {waitingOnMe
              ? `Bạn hết tài sản để bán. Đang chờ ${rescuerName} quyết định hỗ trợ`
              : `${debtorName} hết tài sản để bán, đang chờ ${rescuerName} quyết định hỗ trợ`}
          </strong>
          <span>{`Khoản hỗ trợ ${formatMoney(offer.amount)} sẽ trả thẳng cho ${creditorName}`}</span>
        </div>
        <span role="timer">
          <Chip tone="loss" icon={<ActionIcon name="clock" />}>{`${countdown || '0:00'} còn lại`}</Chip>
        </span>
      </section>
    );
  }

  const balance = rescuer?.accountBalance ?? 0;
  const cannotAfford = balance < offer.amount;
  return (
    <Modal
      open
      title="Hỗ trợ đồng đội"
      eyebrow="Cứu trợ khẩn cấp"
      role="alertdialog"
      size="md"
      className="debt-panel-modal debt-panel-modal--rescue"
      describedBy={descriptionId}
      footer={(
        <>
          <Button
            variant="secondary"
            icon={<ActionIcon name="close" />}
            busy={pending === 'DECLINE'}
            disabled={pending !== null}
            onClick={() => answer('DECLINE')}
          >Không hỗ trợ</Button>
          <Button
            icon={<ActionIcon name="rescue" />}
            busy={pending === 'ACCEPT'}
            disabled={pending !== null || cannotAfford}
            onClick={() => answer('ACCEPT')}
          >{`Hỗ trợ đồng đội — ${formatMoney(offer.amount)}`}</Button>
        </>
      )}
    >
      <p id={descriptionId} className="sr-only">
        {`${debtorName} hết tài sản để bán và còn thiếu ${formatMoney(claim.remainingAmount)}. Bạn có thể trả ${formatMoney(offer.amount)} cho ${creditorName} thay đồng đội. ${RESCUE_DECLINE_CONSEQUENCE}`}
      </p>
      <section className="debt-panel__summary" aria-label="Khoản hỗ trợ" tabIndex={-1} data-modal-autofocus>
        <div className="debt-panel__due">
          <span className="debt-panel__label">Số tiền hỗ trợ</span>
          <strong className="debt-panel__due-amount">{formatMoney(offer.amount)}</strong>
        </div>
        <div className="debt-panel__creditor">
          {debtor
            ? <PlayerAvatar characterId={debtor.characterId ?? null} colorId={debtor.color} size={32} />
            : null}
          <span className="debt-panel__creditor-name">
            <span className="debt-panel__label">Đồng đội đang nợ</span>
            <strong>{debtorName}</strong>
          </span>
        </div>
        <Chip tone="loss" icon={<ActionIcon name="clock" />} className="debt-panel__countdown">
          <span role="timer">{`${countdown || '0:00'} còn lại`}</span>
        </Chip>
        <dl className="debt-panel__facts">
          <div className="debt-panel__fact">
            <dt>Trả cho</dt>
            <dd>{creditorName}</dd>
          </div>
          <div className="debt-panel__fact">
            <dt>Tiền mặt của bạn</dt>
            <dd>{formatMoney(balance)}</dd>
          </div>
          <div className="debt-panel__fact debt-panel__fact--short">
            <dt>Sau khi hỗ trợ</dt>
            <dd>{formatMoney(Math.max(0, balance - offer.amount))}</dd>
          </div>
        </dl>
      </section>
      <p className="debt-panel__rescue-note">
        {`${debtorName} đã bán hết tài sản nhưng vẫn thiếu ${formatMoney(claim.remainingAmount)}. Tiền hỗ trợ được trả thẳng cho ${creditorName}, không chuyển vào ví của ${debtorName}.`}
      </p>
      <p className="debt-panel__rescue-warning">{RESCUE_DECLINE_CONSEQUENCE}</p>
      {cannotAfford
        ? <p className="debt-panel__error" role="alert">{`Bạn cần ${formatMoney(offer.amount)} để hỗ trợ.`}</p>
        : null}
      {error ? <p className="debt-panel__error" role="alert">{error}</p> : null}
      {pending
        ? <p className="debt-panel__pending" role="status">Đang gửi quyết định…</p>
        : null}
    </Modal>
  );
}
