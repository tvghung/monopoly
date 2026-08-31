import {
  useCallback, useContext, useRef, useEffect, useState, type FormEvent,
} from 'react';
import type { ActivityEvent, MoneyTransferReason } from '@monopoly/shared';
import { formatMoney, gameCardsById, tileState } from '@monopoly/shared';
import { MessageCircle, Send } from 'lucide-react';
import './style/Log.css';
import stateContext from '../internal';
import { usePresentation } from '../game/presentation/PresentationProvider';

export const LOG_IDLE_TIMEOUT_MS = 3000;

export function getLogActivitySignature(logs: readonly string[]): string {
  return JSON.stringify([logs.length, logs.at(-1) ?? '']);
}

export function getActivitySignature(
  activity: readonly ActivityEvent[],
  logs: readonly string[],
): string {
  const last = activity.at(-1);
  return JSON.stringify([
    activity.length,
    last?.sequence ?? 0,
    last?.eventId ?? '',
    getLogActivitySignature(logs),
  ]);
}

const moneyReasonLabel: Record<MoneyTransferReason, string> = {
  PROPERTY_PURCHASE: 'mua tài sản',
  PROPERTY_SALE: 'bán tài sản',
  RENT: 'tiền thuê',
  TAX: 'thuế',
  PASS_GO: 'đi qua GO',
  CARD: 'hiệu ứng thẻ',
  DEVELOPMENT: 'phát triển tài sản',
  BAIL: 'tiền bảo lãnh',
  TRADE: 'giao dịch',
  FORCED_SALE: 'bán bắt buộc',
  FORFEIT: 'bỏ cuộc',
  OTHER: 'giao dịch tiền',
};

const jailActionLabel: Record<Extract<ActivityEvent, { type: 'JAIL' }>['action'], string> = {
  ENTRY: 'vào tù',
  RELEASE: 'ra tù',
  FAILED_ROLL: 'chưa đổ được đôi trong tù',
};

const endpointName = (endpoint: Extract<ActivityEvent, { type: 'MONEY_TRANSFER' }>['source']): string => (
  endpoint.kind === 'BANK' ? 'Ngân hàng' : endpoint.name
);

function activityText(event: ActivityEvent): string {
  switch (event.type) {
    case 'PLAYER_JOINED':
      return `${event.playerName} đã tham gia phòng.`;
    case 'GAME_STARTED':
      return `Ván chơi bắt đầu. ${event.startingPlayerName} đi trước.`;
    case 'CHAT':
      return `${event.senderName}: ${event.message}`;
    case 'DICE_ROLL':
      return `${event.playerName} đổ ${event.dice1} + ${event.dice2} = ${event.total}${event.context === 'JAIL' ? ' trong tù' : ''}.`;
    case 'TILE_LANDED': {
      const tile = tileState[event.tileID];
      if (tile?.tileType === 'jail') return `${event.playerName} đang Thăm Tù.`;
      if (tile?.tileType === 'gojail') return `${event.playerName} đã tới ô Vào Tù.`;
      return `${event.playerName} đã tới ${tile?.streetName ?? `ô ${event.tileID}`}.`;
    }
    case 'PROPERTY_PURCHASE':
      return `${event.playerName} đã mua ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`} với giá ${formatMoney(event.price)}.`;
    case 'PROPERTY_TRANSFER':
      return `${endpointName(event.from)} chuyển ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`} cho ${endpointName(event.to)}.`;
    case 'MONEY_TRANSFER':
      return `${endpointName(event.source)} trả ${formatMoney(event.amount)} cho ${endpointName(event.destination)} (${moneyReasonLabel[event.reason]}).`;
    case 'PROPERTY_DEVELOPMENT':
      return event.action === 'SELL'
        ? `${event.playerName} bán một cấp công trình tại ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`} và nhận ${formatMoney(event.cost ?? 0)}.`
        : event.action === 'UPGRADE_HOTEL'
          ? `${event.playerName} nâng cấp Khách sạn tại ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`}.`
          : `${event.playerName} xây ${event.toHouses - event.fromHouses} Nhà tại ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`}.`;
    case 'CARD_REVEALED':
      return `${event.playerName} rút thẻ ${event.deck === 'chance' ? 'Cơ hội' : 'Khí vận'}: ${gameCardsById[event.cardId]?.message ?? event.cardId}`;
    case 'JAIL':
      return `${event.playerName} ${jailActionLabel[event.action]}.`;
    case 'PLAYER_FINISHED':
      return event.reason === 'BANKRUPT'
        ? `${event.playerName} đã phá sản và rời khỏi ván chơi.`
        : `${event.playerName} đã rời ván chơi.`;
    case 'GAME_FINISHED':
      return `${event.winnerName} chiến thắng với ${formatMoney(event.finalCash)}.`;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export default function Log() {
  const {
    state, socketFunctions, connected, playerId,
  } = useContext(stateContext);
  const { state: presentation, queue } = usePresentation();
  const [chat, setChat] = useState('');
  const [idle, setIdle] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLElement>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProcessedSequenceRef = useRef<number | null>(null);
  const lastSeenChatSequenceRef = useRef(0);
  const resetEpochRef = useRef(presentation.presentationResetEpoch);
  const visibleActivity = queue ? presentation.displayActivity : state.boardState.activityFeed.events;
  const narrativeActivity = visibleActivity.filter(event => event.type !== 'DICE_ROLL');
  const visibleLogs = queue
    ? presentation.displayLogs
    : visibleActivity.length > 0 ? [] : state.boardState.logs;
  const activitySignature = getActivitySignature(visibleActivity, visibleLogs);
  const latestActivitySequence = visibleActivity.at(-1)?.sequence ?? 0;
  const latestChatSequence = visibleActivity.reduce(
    (latest, event) => event.type === 'CHAT' ? Math.max(latest, event.sequence) : latest,
    0,
  );

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current !== null) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const markActive = useCallback(() => {
    setIdle(false);
    clearIdleTimeout();
    idleTimeoutRef.current = setTimeout(() => {
      idleTimeoutRef.current = null;
      setIdle(true);
    }, LOG_IDLE_TIMEOUT_MS);
  }, [clearIdleTimeout]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activitySignature]);

  useEffect(() => {
    markActive();
    return clearIdleTimeout;
  }, [activitySignature, clearIdleTimeout, markActive]);

  useEffect(() => {
    const lastProcessed = lastProcessedSequenceRef.current;
    const reset = resetEpochRef.current !== presentation.presentationResetEpoch
      || (lastProcessed !== null && latestActivitySequence < lastProcessed);
    if (lastProcessed === null || reset) {
      lastProcessedSequenceRef.current = latestActivitySequence;
      lastSeenChatSequenceRef.current = latestChatSequence;
      resetEpochRef.current = presentation.presentationResetEpoch;
      setUnreadCount(0);
      return;
    }

    if (latestActivitySequence > lastProcessed) {
      if (!panelOpen) {
        const newUnread = visibleActivity.filter(event => (
          event.type === 'CHAT'
          && event.sequence > lastProcessed
          && event.sequence > lastSeenChatSequenceRef.current
          && (playerId === null || event.senderPlayerId !== playerId)
        )).length;
        if (newUnread > 0) setUnreadCount(count => count + newUnread);
      }
      lastProcessedSequenceRef.current = latestActivitySequence;
    }

    if (panelOpen) {
      lastSeenChatSequenceRef.current = latestChatSequence;
      setUnreadCount(0);
    }
  }, [latestActivitySequence, latestChatSequence, panelOpen, playerId, presentation.presentationResetEpoch, visibleActivity]);

  const sendChat = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    markActive();
    if (chat) socketFunctions.sendChat(chat);
    setChat('');
    e.currentTarget.reset();
  };

  return (
    <section
      className={`center__room${idle ? ' center__room--idle' : ''}${panelOpen ? '' : ' center__room--collapsed'}`}
      data-testid="board-log-overlay"
      data-idle={idle}
      aria-label="Nhật ký và trò chuyện"
      onPointerDown={markActive}
      onFocusCapture={markActive}
    >
      <button
        className="center__room-toggle"
        type="button"
        aria-expanded={panelOpen}
        aria-controls="board-log-panel"
        aria-label={panelOpen ? 'Ẩn nhật ký và trò chuyện' : 'Hiện nhật ký và trò chuyện'}
        title={panelOpen ? 'Ẩn nhật ký và trò chuyện' : 'Hiện nhật ký và trò chuyện'}
        onClick={() => setPanelOpen(open => !open)}
      >
        <MessageCircle aria-hidden="true" size={19} strokeWidth={2.25} />
        {unreadCount > 0
          ? (
            <span
              className="center__room-unread"
              aria-label={`${unreadCount} tin nhắn chưa đọc`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )
          : null}
      </button>
      {panelOpen
        ? (
          <div id="board-log-panel" className="center__room-panel">
            <section ref={scrollRef} className="center__log" role="log" aria-live="polite" aria-label="Nhật ký ván chơi">
              {state.loaded
                ? [
                  ...visibleLogs.map((entry, index) => <p key={`legacy-${index}`}>{entry}</p>),
                  ...narrativeActivity.map(event => (
                    <p
                      key={event.eventId}
                      className={`activity-entry activity-entry--${event.type.toLowerCase()}`}
                    >
                      {activityText(event)}
                    </p>
                  )),
                ]
                : <p>Đang tải…</p>}
            </section>
            <section className="center__chat">
              <form className="center__chat--form" onSubmit={sendChat}>
                <input
                  className="center__chat--input"
                  aria-label="Tin nhắn"
                  disabled={!connected}
                  onChange={e => {
                    markActive();
                    setChat(e.target.value);
                  }}
                  type="text"
                  name="chat"
                  id="chat"
                  autoComplete="off"
                  placeholder="Nhập tin nhắn…"
                />
                <button className="center__chat--button" type="submit" disabled={!connected}>
                  <Send aria-hidden="true" size={16} strokeWidth={2.25} />
                  <span>Gửi</span>
                </button>
              </form>
            </section>
          </div>
        )
        : null}
    </section>
  );
}
