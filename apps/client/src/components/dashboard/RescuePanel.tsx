import { useContext, useEffect, useId, useState } from 'react';
import type { Ack, EmergencyRescueOffer, PublicGameState } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney } from '../../presentation';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import Modal from '../../design-system/components/Modal/Modal';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { formatCountdown, useCountdownSeconds } from '../../game/ui/hud/useCountdown';
import { selectRescueOffer } from '../../game/team/teamView';
import './DebtPanel.css';
import { useTranslation } from '../../i18n/I18n';
import { useLocalizedError } from '../../i18n/useLocalizedError';

type DebtClaim = NonNullable<PublicGameState['boardState']['paymentShortfall']>;

type RescueAnswer = 'ACCEPT' | 'DECLINE';

/**
 * Emergency Rescue (2v2). The debtor has nothing left to sell, so the debt's open window belongs to the one active teammate who
 * can cover it: they pay the creditor directly, never the debtor's wallet. The rescuer gets a dialog; everyone else, including the
 * debtor, sees who is deciding and for how long. The server owns the deadline and the amount; this only displays them and sends
 * the offer id back.
 */
export default function RescuePanel({ claim, offer }: { claim: DebtClaim; offer: EmergencyRescueOffer }) {
  const { t } = useTranslation();
  const {
    state, playerId, canMutate, connected, socketFunctions,
  } = useContext(stateContext);
  const descriptionId = useId();
  const [pending, setPending] = useState<RescueAnswer | null>(null);
  const { error, clearError, setErrorKey, setAckError } = useLocalizedError();
  const seconds = useCountdownSeconds(offer.expiresAt);
  const debtor = state.players[offer.debtorPlayerId];
  const rescuer = state.players[offer.rescuerPlayerId];
  const creditorPlayer = claim.creditor === 'BANK' ? undefined : state.players[claim.creditorPlayerId ?? ''];
  const creditorName = claim.creditor === 'BANK' ? t('ui.bank') : creditorPlayer?.name ?? t('ui.player');
  const debtorName = debtor?.name ?? t('team.teammate');
  const rescuerName = rescuer?.name ?? t('team.teammate');
  const countdown = seconds === null ? '' : formatCountdown(seconds);
  const isRescuer = selectRescueOffer(state, playerId)?.rescueId === offer.rescueId;

  // A new offer (or losing the connection) starts the dialog over; the buttons never stay stuck on a stale answer.
  useEffect(() => {
    setPending(null);
    clearError();
  }, [offer.rescueId, canMutate, clearError, connected]);

  const answer = (choice: RescueAnswer) => {
    if (pending) return;
    const command = choice === 'ACCEPT' ? socketFunctions.acceptRescue : socketFunctions.declineRescue;
    if (!command) return;
    setPending(choice);
    clearError();
    void (async () => {
      try {
        const response: void | Ack = await command(offer.rescueId);
        if (response && !response.ok) {
          setPending(null);
          setAckError(response.error);
        }
      } catch {
        setPending(null);
        setErrorKey('forcedSale.failed');
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
              ? t('dashboard.rescueWaitDebtor', { rescuer: rescuerName })
              : t('dashboard.rescueWaitOther', { debtor: debtorName, rescuer: rescuerName })}
          </strong>
          <span>{t('dashboard.rescueDirectAmount', { amount: formatMoney(offer.amount), creditor: creditorName })}</span>
        </div>
        <span role="timer">
          <Chip tone="loss" icon={<ActionIcon name="clock" />}>{t('dashboard.timeLeft', { time: countdown || '0:00' })}</Chip>
        </span>
      </section>
    );
  }

  const balance = rescuer?.accountBalance ?? 0;
  const cannotAfford = balance < offer.amount;
  return (
    <Modal
      open
      title={t('dashboard.rescueTitle')}
      eyebrow={t('dashboard.rescueEyebrow')}
      role="alertdialog"
      size="md"
      peek="decision"
      peekKey={offer.rescueId}
      peekSummary={<Chip tone="loss" icon={<ActionIcon name="clock" />}>{t('dashboard.timeLeft', { time: countdown || '0:00' })}</Chip>}
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
          >{t('dashboard.rescueDeclined')}</Button>
          <Button
            icon={<ActionIcon name="rescue" />}
            busy={pending === 'ACCEPT'}
            disabled={pending !== null || cannotAfford}
            onClick={() => answer('ACCEPT')}
          >{t('dashboard.rescuePayButton', { amount: formatMoney(offer.amount) })}</Button>
        </>
      )}
    >
      <p id={descriptionId} className="sr-only">
        {t('dashboard.rescueConsequences', { debtor: debtorName, amount: formatMoney(claim.remainingAmount), offer: formatMoney(offer.amount), creditor: creditorName })}
      </p>
      <section className="debt-panel__summary" aria-label={t('dashboard.rescueSummary')} tabIndex={-1} data-modal-autofocus>
        <div className="debt-panel__due">
          <span className="debt-panel__label">{t('dashboard.rescueAmount')}</span>
          <strong className="debt-panel__due-amount">{formatMoney(offer.amount)}</strong>
        </div>
        <div className="debt-panel__creditor">
          {debtor
            ? <PlayerAvatar characterId={debtor.characterId ?? null} colorId={debtor.color} size={32} />
            : null}
          <span className="debt-panel__creditor-name">
            <span className="debt-panel__label">{t('dashboard.teammateInDebt')}</span>
            <strong>{debtorName}</strong>
          </span>
        </div>
        <Chip tone="loss" icon={<ActionIcon name="clock" />} className="debt-panel__countdown">
          <span role="timer">{t('dashboard.timeLeft', { time: countdown || '0:00' })}</span>
        </Chip>
        <dl className="debt-panel__facts">
          <div className="debt-panel__fact">
            <dt>{t('dashboard.payTo')}</dt>
            <dd>{creditorName}</dd>
          </div>
          <div className="debt-panel__fact">
            <dt>{t('dashboard.cash')}</dt>
            <dd>{formatMoney(balance)}</dd>
          </div>
          <div className="debt-panel__fact debt-panel__fact--short">
            <dt>{t('dashboard.afterRescue')}</dt>
            <dd>{formatMoney(Math.max(0, balance - offer.amount))}</dd>
          </div>
        </dl>
      </section>
      <p className="debt-panel__rescue-note">
        {t('dashboard.rescueContext', { debtor: debtorName, amount: formatMoney(claim.remainingAmount), creditor: creditorName })}
      </p>
      <p className="debt-panel__rescue-warning">{t('dashboard.rescueDeclineConsequence')}</p>
      {cannotAfford
        ? <p className="debt-panel__error" role="alert">{t('dashboard.rescueRequiredCash', { amount: formatMoney(offer.amount) })}</p>
        : null}
      {error ? <p className="debt-panel__error" role="alert">{error}</p> : null}
      {pending
        ? <p className="debt-panel__pending" role="status">{t('dashboard.rescuePending')}</p>
        : null}
    </Modal>
  );
}
