import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './VictoryConfetti.css';

/** One burst, at most this many pieces, over at most this long (plan 04 OD-04-4). */
export const CONFETTI_PIECE_COUNT = 48;
export const CONFETTI_DURATION_MS = 1200;

const COLORS = ['lacquer', 'gold', 'jade', 'paper'] as const;
const GOLDEN_RATIO = 0.61803398875;

interface Piece {
  color: typeof COLORS[number];
  style: CSSProperties;
}

/**
 * The fan is computed from the piece index, not from `Math.random()`, so a render is pure and the burst is the same
 * every time. Piece `i` leaves the origin at an angle spread across the upper half and ends `delay + duration` later,
 * never after `CONFETTI_DURATION_MS`.
 */
const PIECES: readonly Piece[] = Array.from({ length: CONFETTI_PIECE_COUNT }, (_, index) => {
  const fan = (index + 0.5) / CONFETTI_PIECE_COUNT;
  const jitter = (index * GOLDEN_RATIO) % 1;
  const angle = Math.PI * (1.08 - 1.16 * fan);
  const reach = 26 + 26 * jitter;
  return {
    color: COLORS[index % COLORS.length],
    style: {
      '--dx': `${(Math.cos(angle) * reach).toFixed(1)}vw`,
      '--rise': `${(-Math.sin(angle) * (16 + 16 * jitter)).toFixed(1)}vh`,
      '--fall': `${(34 + 20 * jitter).toFixed(1)}vh`,
      '--spin': `${Math.round(360 + 540 * jitter) * (index % 2 === 0 ? 1 : -1)}deg`,
      animationDelay: `${(index % 8) * 20}ms`,
      animationDuration: `${Math.round(900 + 150 * jitter)}ms`,
    } as CSSProperties,
  };
});

/**
 * A single decorative confetti burst above the victory screen. It is aria-hidden, ignores the pointer and removes
 * itself when the burst is over; the caller mounts it only for a live appearance without reduced motion.
 */
export default function VictoryConfetti() {
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setFinished(true), CONFETTI_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (finished) return null;
  return createPortal(
    <div className="victory-confetti" aria-hidden="true">
      {PIECES.map((piece, index) => (
        <span key={index} className="victory-confetti__piece" data-color={piece.color} style={piece.style} />
      ))}
    </div>,
    document.body,
  );
}
