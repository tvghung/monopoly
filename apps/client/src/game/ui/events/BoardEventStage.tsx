import {
  useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties,
} from 'react';
import { gameCardsById, tileState, type MoneyEndpoint } from '@monopoly/shared';
import stateContext from '../../../internal';
import { usePresentation } from '../../presentation/PresentationProvider';
import { formatMoney, getTileName } from '../formatters';
import './BoardEventStage.css';

const reasonLabel: Record<string, string> = {
  PROPERTY_PURCHASE: 'THANH TOÁN MUA ĐẤT',
  PROPERTY_SALE: 'NGÂN HÀNG THANH TOÁN',
  RENT: 'TIỀN THUÊ',
  PASS_GO: 'THƯỞNG XUẤT PHÁT',
  CARD: 'HIỆU LỰC THẺ',
  DEVELOPMENT: 'CHI PHÍ XÂY DỰNG',
  BAIL: 'TIỀN BẢO LÃNH',
  TRADE: 'GIAO DỊCH RIÊNG',
  FORCED_SALE: 'BÁN BẮT BUỘC',
  FORFEIT: 'HOÀN TRẢ NGÂN HÀNG',
  OTHER: 'THANH TOÁN',
};

const eventPropertyColors: Record<string, string> = {
  brown: '#9b6a3a',
  lightblue: '#5fc9e3',
  pink: '#e088bd',
  orange: '#f07a3c',
  red: '#e4767e',
  yellow: '#f4c83f',
  green: '#75ca78',
  blue: '#6da0e3',
  railroad: '#66777d',
  company: '#6fa49a',
};

export default function BoardEventStage() {
  const { state, playerId, role, canMutate, socketFunctions } = useContext(stateContext);
  const { state: presentation } = usePresentation();
  const pending = state.turnInfo.pendingCardInteraction;
  const [cardError, setCardError] = useState('');
  const [revealUnlocked, setRevealUnlocked] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeCard = Boolean(pending && pending.playerId === playerId && role === 'PLAYER' && canMutate);
  const tokenAtSource = pending
    ? (presentation.settledPositions[pending.playerId]
      ?? state.players[pending.playerId]?.currentTile) === pending.sourceTile
    : false;
  const cardPresentation = presentation.cardPresentation?.operationId === pending?.operationId
    ? presentation.cardPresentation
    : null;
  const drawing = pending?.stage === 'REVEALED' && cardPresentation?.stage === 'DRAWING';
  const card = pending?.revealedCardId ? gameCardsById[pending.revealedCardId] : undefined;

  useEffect(() => {
    setCardError('');
    if (!pending?.operationId || pending.stage !== 'REVEALED' || drawing) {
      setRevealUnlocked(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setRevealUnlocked(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeCard, drawing, pending?.operationId, pending?.stage]);
  useEffect(() => {
    if (revealUnlocked && activeCard) closeButtonRef.current?.focus();
  }, [activeCard, revealUnlocked]);

  const dismiss = useCallback(async (): Promise<void> => {
    if (!pending || !activeCard || !revealUnlocked || pending.stage !== 'REVEALED') return;
    const response = await socketFunctions.dismissCard?.(pending.operationId);
    if (response && !response.ok) setCardError(response.error.message);
  }, [activeCard, pending, revealUnlocked, socketFunctions]);

  useEffect(() => {
    if (!pending || pending.stage !== 'REVEALED' || !activeCard) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      void dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeCard, dismiss, pending]);

  const playerName = useCallback((id: string): string => state.players[id]?.name
    ?? state.boardState.finishedPlayers[id]?.name
    ?? 'Người chơi', [state.boardState.finishedPlayers, state.players]);
  const endpointName = useCallback((endpoint: MoneyEndpoint | undefined): string => {
    if (!endpoint) return '';
    return endpoint.kind === 'BANK' ? 'Ngân hàng' : playerName(endpoint.playerId);
  }, [playerName]);
  const stageCopy = useMemo(() => {
    const event = presentation.activeBoardEvent;
    if (!event) return null;
    const names = event.playerIds.map(playerName);
    const properties = event.tileIds.map(getTileName);
    switch (event.kind) {
      case 'MONEY_TRANSFER':
        return {
          kicker: event.reason ? reasonLabel[event.reason] ?? 'THANH TOÁN' : 'THANH TOÁN',
          title: event.amount ? formatMoney(event.amount) : '',
          detail: [endpointName(event.source), endpointName(event.destination)].filter(Boolean).join(' → '),
        };
      case 'PROPERTY_PURCHASE':
        return {
          kicker: 'ĐÃ MUA',
          title: properties.join(', '),
          detail: [names.at(-1), event.amount ? formatMoney(event.amount) : ''].filter(Boolean).join(' · '),
        };
      case 'PROPERTY_TRANSFER':
        return { kicker: 'ĐỔI CHỦ', title: properties.join(', '), detail: names.join(' → ') };
      case 'DEVELOPMENT': {
        const from = event.fromHouses ?? 0;
        const to = event.toHouses ?? from;
        const detail = to === 5
          ? 'Nâng cấp khách sạn'
          : to > from ? `Xây thêm ${to - from} nhà` : `Còn ${to} nhà`;
        return { kicker: 'XÂY DỰNG', title: properties.join(', '), detail: `${names[0] ?? ''}${names[0] ? ' · ' : ''}${detail}` };
      }
      case 'PASS_GO':
        return { kicker: 'QUA XUẤT PHÁT', title: event.amount ? `+${formatMoney(event.amount)}` : '', detail: names[0] ?? '' };
      case 'SENT_TO_JAIL':
        return { kicker: names[0] ?? 'NGƯỜI CHƠI', title: 'BỊ ĐƯA VÀO NHÀ TÙ', detail: event.cause === 'CARD' ? 'Theo hiệu lực thẻ' : 'Theo ô bàn cờ' };
      case 'JAIL_ROLL_FAILED':
        return { kicker: 'CHƯA ĐƯỢC RA TÙ', title: names[0] ?? '', detail: 'Chưa đổ được đôi' };
      case 'JAIL_RELEASED':
        return { kicker: 'ĐƯỢC RA TÙ', title: names[0] ?? '', detail: '' };
      default:
        return null;
    }
  }, [endpointName, playerName, presentation.activeBoardEvent]);
  const rawPropertyColor = presentation.activeBoardEvent?.kind === 'PROPERTY_PURCHASE'
    ? tileState[presentation.activeBoardEvent.tileIds[0] ?? -1]?.color
    : undefined;
  const propertyColor = rawPropertyColor ? eventPropertyColors[rawPropertyColor] ?? '#738689' : undefined;

  const draw = async (): Promise<void> => {
    if (!pending || !activeCard || pending.stage !== 'AWAITING_DRAW') return;
    const response = await socketFunctions.drawCard?.(pending.operationId);
    if (response && !response.ok) setCardError(response.error.message);
  };

  return (
    <>
      {stageCopy
        ? (
          <section
            className="board-event-stage"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={propertyColor ? { '--event-property-color': propertyColor } as CSSProperties : undefined}
          >
            <span className="board-event-stage__kicker">{stageCopy.kicker}</span>
            <strong>{stageCopy.title}</strong>
            {stageCopy.detail ? <span>{stageCopy.detail}</span> : null}
            {propertyColor ? <i className="board-event-stage__property-color" aria-label={`Nhóm màu ${rawPropertyColor}`} /> : null}
          </section>
        )
        : null}
      {pending && tokenAtSource
        ? (
          <div
            className="card-interaction-backdrop"
            onMouseDown={event => {
              if (event.target === event.currentTarget) void dismiss();
            }}
          >
            <section
              className={`card-interaction-stage card-interaction-stage--${pending.deck}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="card-interaction-title"
            >
              <span className="card-interaction-stage__deck">
                {pending.deck === 'chance' ? 'CƠ HỘI' : 'KHÍ VẬN'}
              </span>
              {pending.stage === 'REVEALED'
                ? (
                  <button
                    ref={closeButtonRef}
                    type="button"
                    className="card-interaction-stage__close"
                    aria-label="Đóng thẻ"
                    disabled={!activeCard || !revealUnlocked || drawing}
                    onClick={() => void dismiss()}
                  >×</button>
                )
                : null}
              {pending.stage === 'AWAITING_DRAW'
                ? (
                  <>
                    <h2 id="card-interaction-title">{activeCard ? 'Đến lượt bạn rút thẻ' : `Đang chờ ${playerName(pending.playerId)} rút thẻ`}</h2>
                    <p>Lá trên cùng đã được khóa cho lượt này.</p>
                    {activeCard
                      ? <button type="button" className="card-interaction-stage__draw" autoFocus onClick={() => void draw()}>RÚT THẺ</button>
                      : <span className="card-interaction-stage__waiting">Vui lòng chờ…</span>}
                  </>
                )
                : drawing
                  ? <h2 id="card-interaction-title">Đang mở thẻ…</h2>
                  : (
                    <>
                      <h2 id="card-interaction-title">{card?.message ?? 'Thẻ đã được rút'}</h2>
                      <p>{activeCard ? 'Đọc xong, đóng thẻ để áp dụng hiệu lực.' : `Đang chờ ${playerName(pending.playerId)} đóng thẻ.`}</p>
                    </>
                  )}
              {cardError ? <p className="card-interaction-stage__error" role="alert">{cardError}</p> : null}
            </section>
          </div>
        )
        : null}
    </>
  );
}
