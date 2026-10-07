import type { BalanceDeltaSignal } from '../../presentation/store/types';
import PlayerCard from './PlayerCard';
import type { PlayerCardViewModel } from './playerCardSelectors';
import { useTranslation } from '../../../i18n/I18n';

export interface PlayerCardListProps {
  cards: readonly PlayerCardViewModel[];
  deltas: readonly BalanceDeltaSignal[];
  reducedMotion: boolean;
  speed: number;
  resetEpoch: number;
  /** Latest chat text per player id, for the speech bubbles. */
  bubbles?: Readonly<Record<string, string>>;
  /** Opens a player's portfolio when their card is pressed; without it the cards are plain displays. */
  onSelectPlayer?: (playerId: string) => void;
}

/**
 * The seated players as an accessible roster: a named section with an ordered list whose items carry a plain-text
 * summary. The card faces inside are decorative. This list replaces the old sr-only station roster.
 */
export default function PlayerCardList({
  cards, deltas, reducedMotion, speed, resetEpoch, bubbles, onSelectPlayer,
}: PlayerCardListProps) {
  const { t } = useTranslation();
  return (
    <section className="player-card-list" aria-label={t('hud.players')}>
      {/* role="list" keeps the list semantics in WebKit, which drops them when list-style is none. */}
      <ol className="player-card-list__items" role="list">
        {cards.map(card => (
          <PlayerCard
            key={card.playerId}
            card={card}
            deltas={deltas}
            reducedMotion={reducedMotion}
            speed={speed}
            resetEpoch={resetEpoch}
            bubble={bubbles?.[card.playerId]}
            onSelect={onSelectPlayer}
          />
        ))}
      </ol>
    </section>
  );
}
