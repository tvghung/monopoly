import { useContext, useId, useState, type CSSProperties } from 'react';
import type { CharacterId, FinishedPlayerReason, PlayerColorId, PublicGameState, RoomPlayerMeta } from '@monopoly/shared';
import { MapPin } from 'lucide-react';
import stateContext from '../../internal';
import { useRoomExit } from '../../roomExitContext';
import { useEffectiveReducedMotion } from '../../settings/selectors';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import MoneyText from '../../design-system/components/MoneyText/MoneyText';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { SHORT_VIEWPORT_QUERY, useMediaQuery } from '../../design-system/useMediaQuery';
import { getPlayerColorLabel, getPlayerDisplayColor } from '../../game/ui/playerVisualColors';
import { getTeamVictorySummary, type TeamVictorySummary } from '../../game/team/teamView';
import useVictoryVisibility from './useVictoryVisibility';
import VictoryConfetti from './VictoryConfetti';
import './WinnerBanner.css';
import { useTranslation } from '../../i18n/I18n';
import { useLocalizedError } from '../../i18n/useLocalizedError';

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

export interface OtherPlayer {
  playerId: string;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  /** Why the player is out, or `null` for a player still seated when the game ended. */
  status: FinishedPlayerReason | null;
  /** Cash at the end, when it is known. */
  finalCash: number | null;
}

/**
 * Everyone but the winner: the players that left the game (`finishedPlayers`) and any still seated. There is no ranking,
 * because `finishedPlayers` carries no reliable elimination order; the list follows the seat order instead.
 */
export function getOtherPlayers(state: PublicGameState, roomPlayers: readonly RoomPlayerMeta[] = []): OtherPlayer[] {
  const winnerId = state.boardState.winner?.playerId;
  const { finishedPlayers } = state.boardState;
  // In 2v2 the whole winning team is on the podium, so the list is the opposing team only.
  const winningTeam = getTeamVictorySummary(state);
  const winners = new Set<string>(winningTeam ? winningTeam.members.map(member => member.playerId) : []);
  if (winnerId) winners.add(winnerId);
  const out = Object.entries(finishedPlayers)
    .filter(([playerId]) => !winners.has(playerId))
    .map(([playerId, player]): OtherPlayer => ({
      playerId,
      name: player.name,
      color: player.color,
      characterId: player.characterId,
      status: player.reason ?? null,
      finalCash: player.accountBalance ?? null,
    }));
  const seated = Object.entries(state.players)
    .filter(([playerId]) => !winners.has(playerId) && !(playerId in finishedPlayers))
    .map(([playerId, player]): OtherPlayer => ({
      playerId,
      name: player.name,
      color: player.color,
      characterId: player.characterId,
      status: null,
      finalCash: player.accountBalance,
    }));
  const seat = new Map(roomPlayers.map(player => [player.playerId, player.joinOrder]));
  const order = (player: OtherPlayer) => seat.get(player.playerId) ?? Number.MAX_SAFE_INTEGER;
  return [...seated, ...out].sort((a, b) => order(a) - order(b));
}

/** A teammate who was out of the game before the team won: the victory is shared, so this is a note, not a mark against them. */
/** The team podium: "CHIẾN THẮNG!", the team and both members with their mascots, whether or not they were still in play. */
function TeamVictoryHero({ team, short }: { team: TeamVictorySummary; short: boolean }) {
  const { language, t } = useTranslation();
  const headingId = useId();
  return (
    <div className="victory__identity victory__identity--team">
      <p className="victory__eyebrow">{t('winner.team')}</p>
      <h3 id={headingId} className="victory__name victory__name--team">
        <span className="victory__team-crown" aria-hidden="true"><ActionIcon name="crown" /></span>
        {t('winner.celebration')}
      </h3>
      <p className="victory__team-name">
        <span className="victory__swatch" aria-hidden="true" />
        {team.team.name}
        <span className="victory__team-color">{' · ' + getPlayerColorLabel(team.team.color, language)}</span>
      </p>
      <ul className="victory__members" aria-label={t('winner.memberLabel', { name: team.team.name })}>
        {team.members.map(member => (
          <li key={member.playerId} className="victory__member" data-member-status={member.status ?? 'ACTIVE'}>
            <PlayerAvatar characterId={member.characterId} colorId={team.team.color} size={short ? 40 : 72} active={member.status === null} />
            <span className="victory__member-who">
              <strong className="victory__member-name">{member.name}</strong>
              {member.status ? <span className="victory__member-note">{member.status === 'BANKRUPT' ? t('winner.bankruptBefore') : t('winner.leftRoom')}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusChip({ status }: { status: FinishedPlayerReason | null }) {
  const { t } = useTranslation();
  if (status === 'BANKRUPT') return <Chip tone="loss" icon={<ActionIcon name="bankrupt" />}>{t('status.bankrupt')}</Chip>;
  if (status === 'LEFT') return <Chip icon={<ActionIcon name="leave" />}>{t('status.left')}</Chip>;
  return null;
}

// Game-over dialog: the last player standing, what they own, the others, and a way forward for every role.
export default function WinnerBanner() {
  const { language, t } = useTranslation();
  const {
    state, canPlayAgain, socketFunctions, roomPlayers,
  } = useContext(stateContext);
  const exit = useRoomExit();
  const { visible, celebrate } = useVictoryVisibility();
  const reducedMotion = useEffectiveReducedMotion();
  const short = useMediaQuery(SHORT_VIEWPORT_QUERY);
  const othersId = useId();
  const identityId = useId();
  const hintId = useId();
  const [replaying, setReplaying] = useState(false);
  const { error, clearError, setAckError } = useLocalizedError();
  const winner = state.boardState.winner;
  if (!winner) return null;

  const teamVictory = getTeamVictorySummary(state);
  const summary = getWinnerSummary(state);
  const others = getOtherPlayers(state, roomPlayers);
  const buttonSize = short ? 'md' : 'lg';
  // A failed leave request is only visible here: the toolbar message sits under the modal layer.
  const shownError = error ?? exit?.error ?? null;

  const playAgain = async () => {
    if (!socketFunctions.playAgain || !canPlayAgain || replaying) return;
    setReplaying(true);
    clearError();
    const response = await socketFunctions.playAgain();
    if (!response.ok) {
      setAckError(response.error);
      setReplaying(false);
    }
  };

  const footer = (
    <>
      <div className="victory__note">
        <p id={hintId} className="victory__hint">
          {canPlayAgain
            ? t('winner.newGameReady')
            : t('winner.newGameWaiting')}
        </p>
        {shownError ? <p className="victory__error" role="alert">{shownError}</p> : null}
      </div>
      <div className="victory__actions">
        {canPlayAgain
          ? (
            <Button
              data-modal-autofocus
              size={buttonSize}
              icon={<ActionIcon name="playAgain" />}
              busy={replaying}
              onClick={() => { void playAgain(); }}
            >{replaying ? t('winner.prepareNewGame') : t('winner.replay')}</Button>
          )
          : null}
        {exit
          ? (
            <Button
              variant="secondary"
              size={buttonSize}
              icon={<ActionIcon name="home" />}
              busy={exit.leaving}
              onClick={exit.requestLeave}
            >{t('winner.home')}</Button>
          )
          : null}
      </div>
    </>
  );

  return (
    <>
      <Modal
        open={visible}
        title={t('winner.gameOver')}
        role="alertdialog"
        size="xl"
        tone="celebration"
        className="victory"
        describedBy={`${identityId} ${hintId}`}
        footer={footer}
      >
        {/*
          The scrolling body has no control of its own, so this region is the keyboard stop that lets the arrow keys scroll it on a
          short screen. Anyone without "Chơi lại" starts here instead of on "Về trang chủ", which leaves the room at once.
        */}
        <div
          className="victory__content"
          role="region"
          aria-label={t('winner.result')}
          tabIndex={0}
          data-modal-autofocus={canPlayAgain ? undefined : true}
        >
          <section
            className={`victory__hero${teamVictory ? ' victory__hero--team' : ''}`}
            data-victory-kind={teamVictory ? 'TEAM' : 'SOLO'}
            style={{ '--victory-color': getPlayerDisplayColor(teamVictory ? teamVictory.team.color : winner.color) } as CSSProperties}
          >
            {teamVictory
              ? (
                <div id={identityId} className="victory__team-heading">
                  <TeamVictoryHero team={teamVictory} short={short} />
                </div>
              )
              : (
                <>
                  <div className="victory__avatar">
                    <PlayerAvatar characterId={winner.characterId} colorId={winner.color} size={short ? 64 : 128} active />
                    <span className="victory__crown"><ActionIcon name="crown" /></span>
                  </div>
                  <div id={identityId} className="victory__identity">
                    <p className="victory__eyebrow">{t('winner.player')}</p>
                    <h3 className="victory__name">{winner.name}</h3>
                    <p className="victory__color">
                      <span className="victory__swatch" aria-hidden="true" />
                      {getPlayerColorLabel(winner.color, language)}
                    </p>
                  </div>
                </>
              )}
            <dl className="victory__stats">
              <div className="victory__tile victory__tile--cash">
                <dt><ActionIcon name="cash" />{teamVictory ? t('winner.teamCash') : t('winner.finalCash')}</dt>
                <dd><MoneyText amount={teamVictory ? teamVictory.totalCash : summary.finalCash} size="lg" /></dd>
              </div>
              <div className="victory__tile">
                <dt><MapPin aria-hidden="true" focusable="false" />{teamVictory ? t('winner.teamAssets') : t('winner.assets')}</dt>
                <dd>{teamVictory ? teamVictory.propertyCount : summary.propertyCount}</dd>
              </div>
              <div className="victory__tile">
                <dt><ActionIcon name="house" />{t('winner.houses')}</dt>
                <dd>{teamVictory ? teamVictory.houseCount : summary.houseCount}</dd>
              </div>
              <div className="victory__tile">
                <dt><ActionIcon name="hotel" />{t('winner.hotels')}</dt>
                <dd>{teamVictory ? teamVictory.hotelCount : summary.hotelCount}</dd>
              </div>
              {teamVictory
                ? (
                  <div className="victory__tile victory__tile--sets">
                    <dt><ActionIcon name="crown" />{t('winner.fullGroups')}</dt>
                    <dd>{teamVictory.completedColorSets.length}</dd>
                  </div>
                )
                : null}
            </dl>
          </section>
          {others.length > 0
            ? (
              <section className="victory__others" aria-labelledby={othersId}>
                <h3 id={othersId} className="victory__section-title">{teamVictory ? t('winner.otherTeams') : t('winner.otherPlayers')}</h3>
                <ul className="victory__others-list">
                  {others.map(player => (
                    <li key={player.playerId} className="victory__other">
                      <PlayerAvatar characterId={player.characterId} colorId={player.color} size={44} />
                      <div className="victory__other-who">
                        <span className="victory__other-name">{player.name}</span>
                        <StatusChip status={player.status} />
                      </div>
                      {player.finalCash !== null
                        ? (
                          <div className="victory__other-cash">
                            <span>{t('winner.cash')}</span>
                            <MoneyText amount={player.finalCash} size="sm" />
                          </div>
                        )
                        : null}
                    </li>
                  ))}
                </ul>
              </section>
            )
            : null}
        </div>
      </Modal>
      {celebrate && !reducedMotion ? <VictoryConfetti /> : null}
    </>
  );
}
