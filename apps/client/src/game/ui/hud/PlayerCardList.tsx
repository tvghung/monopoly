import type { BalanceDeltaSignal } from '../../presentation/store/types';
import PlayerCard from './PlayerCard';
import type { PlayerCardViewModel } from './playerCardSelectors';

export interface PlayerCardListProps {
  cards: readonly PlayerCardViewModel[];
  deltas: readonly BalanceDeltaSignal[];
  reducedMotion: boolean;
  speed: number;
  resetEpoch: number;
}

/**
 * The seated players as an accessible roster: a named section with an ordered list whose items carry a plain-text
 * summary. The card faces inside are decorative. This list replaces the old sr-only station roster.
 */
export default function PlayerCardList({
  cards, deltas, reducedMotion, speed, resetEpoch,
}: PlayerCardListProps) {
  return (
    <section className="player-card-list" aria-label="Người chơi">
      <ol className="player-card-list__items">
        {cards.map(card => (
          <PlayerCard
            key={card.playerId}
            card={card}
            deltas={deltas}
            reducedMotion={reducedMotion}
            speed={speed}
            resetEpoch={resetEpoch}
          />
        ))}
      </ol>
    </section>
  );
}
