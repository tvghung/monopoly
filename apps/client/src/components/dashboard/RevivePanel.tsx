import { useContext, useEffect, useId, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, localizeAckError } from '../../presentation';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { REVIVABLE_LABEL, selectRevivePrompt } from '../../game/team/teamView';
import './RevivePanel.css';

/**
 * 2v2: shown to the surviving teammate during their own turn while their bankrupt partner can still be revived. It states the
 * price, what the partner returns with and how many survivor turns are left, and says why the button is off when it is. The
 * server re-checks everything (turn, window, money, once per player); this panel only mirrors those answers.
 */
export default function RevivePanel() {
  const {
    state, playerId, canMutate, connected, socketFunctions,
  } = useContext(stateContext);
  const titleId = useId();
  const noteId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prompt = canMutate && state.loaded ? selectRevivePrompt(state, playerId) : null;
  const revivedPlayerId = prompt?.revivedPlayerId ?? null;
  const revived = revivedPlayerId ? state.boardState.finishedPlayers[revivedPlayerId] : undefined;

  // A new prompt, a lost connection or a changed balance puts the button back; a stale "sending" must not stick.
  useEffect(() => {
    setPending(false);
    setError(null);
  }, [canMutate, connected, prompt?.window.playerId, prompt?.balance, prompt?.window.turnsRemaining]);

  if (!prompt || !revived) return null;

  const blocked = !prompt.startsThisTurn
    ? 'Cơ hội hồi sinh bắt đầu từ lượt kế tiếp của bạn.'
    : !prompt.canAfford
      ? `Bạn cần ${formatMoney(prompt.cost)} để hồi sinh ${prompt.revivedName}.`
      : null;

  const revive = () => {
    if (pending || blocked || !socketFunctions.reviveTeammate) return;
    setPending(true);
    setError(null);
    void (async () => {
      try {
        const response: void | Ack = await socketFunctions.reviveTeammate?.();
        if (response && !response.ok) {
          setPending(false);
          setError(localizeAckError(response.error));
        }
      } catch {
        setPending(false);
        setError('Không thể gửi thao tác. Vui lòng thử lại.');
      }
    })();
  };

  return (
    <section className="revive-panel" aria-labelledby={titleId} data-revive-turns={prompt.window.turnsRemaining}>
      <div className="revive-panel__head">
        <PlayerAvatar characterId={revived.characterId ?? null} colorId={revived.color} size={32} />
        <h3 id={titleId} className="revive-panel__title">{`${REVIVABLE_LABEL}: ${prompt.revivedName}`}</h3>
        <Chip tone={prompt.window.turnsRemaining <= 1 ? 'loss' : 'neutral'} className="revive-panel__turns">
          {prompt.turnsLabel}
        </Chip>
      </div>
      <p id={noteId} className="revive-panel__hint">
        {`Trả ${formatMoney(prompt.cost)} cho Ngân hàng. ${prompt.revivedName} trở lại Xuất Phát với ${formatMoney(prompt.startingCash)}, không có tài sản hay thẻ, mỗi người chỉ hồi sinh một lần.`}
      </p>
      {blocked ? <p className="revive-panel__blocked">{blocked}</p> : null}
      {error ? <p className="revive-panel__error" role="alert">{error}</p> : null}
      {pending ? <p className="revive-panel__pending" role="status">Đang gửi yêu cầu…</p> : null}
      <Button
        icon={<ActionIcon name="revive" />}
        busy={pending}
        disabled={pending || blocked !== null}
        aria-describedby={noteId}
        onClick={revive}
      >{`Hồi sinh ${prompt.revivedName} — ${formatMoney(prompt.cost)}`}</Button>
    </section>
  );
}
