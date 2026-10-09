import { useContext, useEffect, useId, useState } from 'react';
import { BAIL_AMOUNT, type Ack } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney } from '../../presentation';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { JAIL_ROUND_LIMIT } from '../../game/ui/hud/playerCardText';
import './JailPanel.css';
import { useTranslation } from '../../i18n/I18n';
import { useLocalizedError } from '../../i18n/useLocalizedError';

// Shown to the current player while they're in jail on their own turn: pay bail
// or spend a Get Out Of Jail Free card (they can still roll for a double too).
export default function JailPanel() {
  const { t } = useTranslation();
  const {
    state, socketFunctions, playerId, canMutate, connected,
  } = useContext(stateContext);
  const myPlayer = typeof playerId === 'string' ? state.players[playerId] : undefined;
  const visible = canMutate
    && state.loaded
    && state.boardState.currentPlayer.id === playerId
    // Being sent to jail mid-turn keeps this player current until the hand-off; the choice belongs to their next turn.
    && !state.boardState.currentPlayer.hasMoved
    && Boolean(myPlayer?.isJail);
  const titleId = useId();
  const warningId = useId();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const { error, clearError, setErrorKey, setAckError } = useLocalizedError();

  useEffect(() => {
    setPendingAction(null);
    setAcknowledged(false);
    clearError();
  }, [canMutate, clearError, connected, myPlayer?.accountBalance, myPlayer?.getOutOfJailCardCount, myPlayer?.isJail, playerId, state.boardState.currentPlayer.id, visible]);

  const submit = (action: string, command?: () => void | Promise<Ack>) => {
    if (pendingAction || !command) return;
    setPendingAction(action);
    setAcknowledged(false);
    clearError();
    void Promise.resolve(command())
      .then(response => {
        if (!response || response.ok) {
          setAcknowledged(true);
          return;
        }
        setPendingAction(null);
        setAckError(response.error);
      })
      .catch(() => {
        setPendingAction(null);
        setErrorKey('jail.failed');
      });
  };

  if (!visible || !myPlayer) return null;

  return (
    // No live region around the whole panel: the buttons change their label while a request is in flight, and the pending and
    // error lines announce themselves.
    <section className="jail-panel" aria-labelledby={titleId}>
      <div className="jail-panel__head">
        <span className="jail-panel__icon" aria-hidden="true"><ActionIcon name="jail" /></span>
        <h3 id={titleId} className="jail-panel__title">{t('jail.title')}</h3>
        <Chip tone="loss" className="jail-panel__rounds">
          {t('jail.rounds', { elapsed: myPlayer.jailOpponentRoundsElapsed, limit: JAIL_ROUND_LIMIT })}
        </Chip>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <p className="jail-panel__hint">{t('jail.hint')}</p>
      {myPlayer.accountBalance < BAIL_AMOUNT
        ? <p id={warningId} className="jail-panel__balance-warning">{t('jail.needBail', { amount: formatMoney(BAIL_AMOUNT) })}</p>
        : null}
      {acknowledged ? <p className="jail-panel__pending" role="status">{t('jail.acknowledged')}</p> : null}
      <div className="jail-panel__actions">
        <Button
          variant="secondary"
          icon={<ActionIcon name="bail" />}
          busy={pendingAction === 'PAY_BAIL'}
          aria-describedby={myPlayer.accountBalance < BAIL_AMOUNT ? warningId : undefined}
          disabled={pendingAction !== null || myPlayer.accountBalance < BAIL_AMOUNT}
          onClick={() => submit('PAY_BAIL', () => socketFunctions.payBail())}
        >
          {pendingAction === 'PAY_BAIL'
            ? acknowledged ? t('jail.updating') : t('jail.sending')
            : t('jail.pay', { amount: formatMoney(BAIL_AMOUNT) })}
        </Button>
        {myPlayer.getOutOfJailCardCount > 0
          ? (
            <Button
              variant="secondary"
              icon={<ActionIcon name="jailCard" />}
              busy={pendingAction === 'USE_CARD'}
              disabled={pendingAction !== null}
              aria-label={pendingAction === 'USE_CARD' ? undefined : t('jail.useCard', { count: myPlayer.getOutOfJailCardCount })}
              onClick={() => submit('USE_CARD', () => socketFunctions.useJailCard())}
            >
              {pendingAction === 'USE_CARD'
                ? acknowledged ? t('jail.updating') : t('jail.sending')
                : (
                  // The phone tier draws the short words; the button's name stays the full one (aria-label below).
                  <>
                    <span className="jail-panel__label-long">{t('jail.useCard', { count: myPlayer.getOutOfJailCardCount })}</span>
                    <span className="jail-panel__label-short">{t('jail.useCardShort', { count: myPlayer.getOutOfJailCardCount })}</span>
                  </>
                )}
            </Button>
          )
          : null}
      </div>
    </section>
  );
}
