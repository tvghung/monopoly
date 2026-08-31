import { useContext, useState } from 'react';
import type { PublicGameState } from '@monopoly/shared';
import { RotateCcw } from 'lucide-react';
import { formatMoney, localizeAckError } from '../../presentation';
import { CHARACTER_REGISTRY } from '../../game/characters/characterRegistry';
import { characterSvgDataUri } from '../../game/characters/characterSvg';
import stateContext from '../../internal';
import Modal from '../../design-system/components/Modal/Modal';
import { getPlayerColorLabel, getPlayerDisplayColor } from '../../game/ui/playerVisualColors';

export interface WinnerSummary {
  finalCash: number;
  propertyCount: number;
  houseCount: number;
  hotelCount: number;
}

export function getWinnerSummary(state: PublicGameState): WinnerSummary {
  const winner = state.boardState.winner;
  if (!winner) return { finalCash: 0, propertyCount: 0, houseCount: 0, hotelCount: 0 };

  const properties = Object.values(state.boardState.ownedProps).filter(property => property.id === winner.playerId);
  return {
    finalCash: state.players[winner.playerId]?.accountBalance ?? winner.accountBalance ?? 0,
    propertyCount: properties.length,
    houseCount: properties.reduce((total, property) => total + (property.houses === 5 ? 0 : property.houses), 0),
    hotelCount: properties.filter(property => property.houses === 5).length,
  };
}

// Game-over modal announcing the last player standing, tinted with their colour.
export default function WinnerBanner() {
  const { state, canPlayAgain, socketFunctions } = useContext(stateContext);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const winner = state.boardState.winner;
  const summary = getWinnerSummary(state);
  const character = winner?.characterId ? CHARACTER_REGISTRY[winner.characterId] : null;

  const playAgain = async () => {
    if (!socketFunctions.playAgain || !canPlayAgain || replaying) return;
    setReplaying(true);
    setError(null);
    const response = await socketFunctions.playAgain();
    if (!response.ok) {
      setError(localizeAckError(response.error));
      setReplaying(false);
    }
  };

  return winner
    ? (
      <Modal open={state.loaded} title="Ván chơi kết thúc" role="alertdialog" className="winner-banner-modal">
        <div className="winner-banner">
          <div className="winner-banner__identity">
            {character
              ? <img
                  className="winner-banner__mascot"
                  src={characterSvgDataUri(character.svgSource, winner.color)}
                  alt={`Mascot ${character.displayName}`}
                />
              : <div className="winner-banner__mascot winner-banner__mascot--empty" aria-hidden="true" />}
            <div>
              <p className="winner-banner__eyebrow">Người chiến thắng</p>
              <h3 style={{ color: getPlayerDisplayColor(winner.color) }}>{winner.name}</h3>
              <p>{character?.displayName ?? 'Chưa chọn mascot'} · {getPlayerColorLabel(winner.color)}</p>
            </div>
          </div>
          <dl className="winner-banner__summary">
            <div><dt>Tiền mặt cuối ván</dt><dd>{formatMoney(summary.finalCash)}</dd></div>
            <div><dt>Tài sản sở hữu</dt><dd>{summary.propertyCount}</dd></div>
            <div><dt>Nhà</dt><dd>{summary.houseCount}</dd></div>
            <div><dt>Khách sạn</dt><dd>{summary.hotelCount}</dd></div>
          </dl>
          {canPlayAgain
            ? (
              <div className="winner-banner__actions">
                <button
                  type="button"
                  data-modal-autofocus
                  disabled={replaying}
                  onClick={() => { void playAgain(); }}
                >
                  <RotateCcw className="action-icon" aria-hidden="true" />
                  {replaying ? 'Đang chuẩn bị ván mới…' : 'Chơi lại'}
                </button>
                <p className="winner-banner__hint">Ván mới giữ nguyên phòng và danh sách người chơi đủ điều kiện.</p>
                {error ? <p className="winner-banner__error" role="alert">{error}</p> : null}
              </div>
            )
            : null}
        </div>
      </Modal>
    )
    : null;
}
