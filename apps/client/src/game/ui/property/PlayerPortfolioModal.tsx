import { useContext } from 'react';
import type { CharacterId, PlayerColorId, PublicGameState, RoomPlayerMeta } from '@monopoly/shared';
import Chip from '../../../design-system/components/Chip/Chip';
import Modal from '../../../design-system/components/Modal/Modal';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import stateContext from '../../../internal';
import TeamChip from '../../team/TeamChip';
import {
  getReviveStatus,
  type ReviveStatus,
} from '../../team/teamView';
import PortfolioView, { PortfolioBalance } from './PortfolioView';
import { useRetainedValue } from './useRetainedValue';
import { useTranslation } from '../../../i18n/I18n';

interface PortfolioPlayer {
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  status: 'playing' | 'bankrupt' | 'left';
  /** The authoritative balance of a player still in the game; finished players show a status instead. */
  balance: number | null;
  /** 2v2: a bankrupt player's revive state, else `null`. */
  revive: ReviveStatus | null;
}

/** Who a portfolio belongs to: a seated player, or one who went bankrupt or left (their deeds are gone, their name stays). */
function resolvePortfolioPlayer(
  state: PublicGameState,
  roomPlayers: readonly RoomPlayerMeta[],
  playerId: string,
): PortfolioPlayer | null {
  const live = state.players[playerId];
  const finished = state.boardState.finishedPlayers[playerId];
  const meta = roomPlayers.find(candidate => candidate.playerId === playerId);
  const source = live ?? finished ?? meta;
  if (!source) return null;
  const status = finished?.reason === 'BANKRUPT'
    ? 'bankrupt'
    : finished?.reason === 'LEFT' || meta?.membershipStatus === 'LEFT' ? 'left' : 'playing';
  return {
    name: source.name,
    color: source.color,
    characterId: source.characterId ?? null,
    status,
    balance: live?.accountBalance ?? null,
    revive: getReviveStatus(state, playerId),
  };
}

/** The balance of a player in the game; a finished player shows why they are out instead. */
function PortfolioStanding({ player }: { player: PortfolioPlayer }) {
  const { t } = useTranslation();
  if (player.status === 'bankrupt') {
    return (
      <>
        <Chip tone="loss" icon={<ActionIcon name="bankrupt" />}>{t('portfolio.ownerBankrupt')}</Chip>
        {player.revive?.kind === 'REVIVABLE'
          ? <Chip tone="info" icon={<ActionIcon name="revive" />}>{`${t('team.revivable')} · ${player.revive.turnsLabel}`}</Chip>
          : null}
        {player.revive?.kind === 'PERMANENT' ? <Chip tone="neutral">{t('team.permanent')}</Chip> : null}
      </>
    );
  }
  if (player.status === 'left') return <Chip tone="neutral" icon={<ActionIcon name="leave" />}>{t('portfolio.ownerLeft')}</Chip>;
  return player.balance === null ? null : <PortfolioBalance amount={player.balance} />;
}

interface PlayerPortfolioModalProps {
  /** The player whose portfolio is shown; `null` closes the dialog. */
  playerId: string | null;
  onClose: () => void;
  /** Opens one property in the inspection dialog (the dialog closes itself first). Without it the deeds have no button. */
  onSelectTile?: (tileId: number) => void;
}

/**
 * The read-only portfolio of any player (plan 03 OD-03-4: a click on a player card opens it). It has no trade or sell
 * action of its own; "Xem" only hands a property to the ordinary inspection dialog.
 */
export default function PlayerPortfolioModal({ playerId, onClose, onSelectTile }: PlayerPortfolioModalProps) {
  const { t } = useTranslation();
  const { state, roomPlayers = [] } = useContext(stateContext);
  // Keep showing the same player while the dialog animates out.
  const shownId = useRetainedValue(playerId);
  const player = shownId === null ? null : resolvePortfolioPlayer(state, roomPlayers, shownId);
  if (shownId === null || !player) return null;

  return (
    <Modal
      open={playerId !== null}
      title={t('portfolio.title', { name: player.name })}
      size="lg"
      onClose={onClose}
      peek="view"
      closeOnOutsideClick
    >
      <PortfolioView
        ownerId={shownId}
        lead={(
          <>
            <PlayerAvatar characterId={player.characterId} colorId={player.color} size={48} />
            {shownId ? <TeamChip playerId={shownId} /> : null}
            <PortfolioStanding player={player} />
          </>
        )}
        emptyText={player.status === 'playing' ? t('portfolio.noneOwned', { name: player.name }) : t('portfolio.noneLeft', { name: player.name })}
        onInspect={onSelectTile ? tileId => {
          onClose();
          onSelectTile(tileId);
        } : undefined}
      />
    </Modal>
  );
}
