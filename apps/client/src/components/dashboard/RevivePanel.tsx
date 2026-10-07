import { useContext, useEffect, useId, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney } from '../../presentation';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { reviveTurnsLabel, selectRevivePrompt } from '../../game/team/teamView';
import './RevivePanel.css';
import { useTranslation } from '../../i18n/I18n';
import { useLocalizedError } from '../../i18n/useLocalizedError';

/**
 * 2v2: shown to the surviving teammate during their own turn while their bankrupt partner can still be revived. It states the
 * price, what the partner returns with and how many survivor turns are left, and says why the button is off when it is. The
 * server re-checks everything (turn, window, money, once per player); this panel only mirrors those answers.
 */
export default function RevivePanel() {
  const { language, t } = useTranslation();
  const {
    state, playerId, canMutate, connected, socketFunctions,
  } = useContext(stateContext);
  const titleId = useId();
  const noteId = useId();
  const [pending, setPending] = useState(false);
  const { error, clearError, setErrorKey, setAckError } = useLocalizedError();
  const prompt = canMutate && state.loaded ? selectRevivePrompt(state, playerId) : null;
  const revivedPlayerId = prompt?.revivedPlayerId ?? null;
  const revived = revivedPlayerId ? state.boardState.finishedPlayers[revivedPlayerId] : undefined;

  // A new prompt, a lost connection or a changed balance puts the button back; a stale "sending" must not stick.
  useEffect(() => {
    setPending(false);
    clearError();
  }, [canMutate, clearError, connected, prompt?.window.playerId, prompt?.balance, prompt?.window.turnsRemaining]);

  if (!prompt || !revived) return null;

  const blocked = !prompt.startsThisTurn
    ? t('dashboard.reviveAvailable')
    : !prompt.canAfford
      ? t('dashboard.reviveNeed', { amount: formatMoney(prompt.cost), name: prompt.revivedName })
      : null;

  const revive = () => {
    if (pending || blocked || !socketFunctions.reviveTeammate) return;
    setPending(true);
    clearError();
    void (async () => {
      try {
        const response: void | Ack = await socketFunctions.reviveTeammate?.();
        if (response && !response.ok) {
          setPending(false);
          setAckError(response.error);
        }
      } catch {
        setPending(false);
        setErrorKey('dashboard.reviveFailed');
      }
    })();
  };

  return (
    <section className="revive-panel" aria-labelledby={titleId} data-revive-turns={prompt.window.turnsRemaining}>
      <div className="revive-panel__head">
        <PlayerAvatar characterId={revived.characterId ?? null} colorId={revived.color} size={32} />
        <h3 id={titleId} className="revive-panel__title">{t('dashboard.reviveTitle')}: {prompt.revivedName}</h3>
        <Chip tone={prompt.window.turnsRemaining <= 1 ? 'loss' : 'neutral'} className="revive-panel__turns">
          {reviveTurnsLabel(prompt.window.turnsRemaining, language)}
        </Chip>
      </div>
      <p id={noteId} className="revive-panel__hint">
        {t('dashboard.revivePay', { amount: formatMoney(prompt.cost), name: prompt.revivedName, cash: formatMoney(prompt.startingCash) })}
      </p>
      {blocked ? <p className="revive-panel__blocked">{blocked}</p> : null}
      {error ? <p className="revive-panel__error" role="alert">{error}</p> : null}
      {pending ? <p className="revive-panel__pending" role="status">{t('dashboard.revivePending')}</p> : null}
      <Button
        icon={<ActionIcon name="revive" />}
        busy={pending}
        disabled={pending || blocked !== null}
        aria-describedby={noteId}
        onClick={revive}
      >{t('dashboard.reviveButton', { name: prompt.revivedName, amount: formatMoney(prompt.cost) })}</Button>
    </section>
  );
}
