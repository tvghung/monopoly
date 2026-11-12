import type { CSSProperties } from 'react';
import './MascotSparkles.css';

/** Coins and stars thrown by a mascot that was tapped or just chosen: six directions over the top half, alternating shapes. */
export const MASCOT_SPARKLE_COUNT = 6;
/** How long a burst lives; the CSS animation ends before this, so the owner can unmount the burst after it. */
export const MASCOT_SPARKLE_LIFETIME_MS = 900;

const SPREAD_START_DEG = -160;
const SPREAD_DEG = 140;

/**
 * A one-shot burst of decoration around a mascot. It has no text and is hidden from assistive technology; mount it with a new
 * `key` to play it again. It is only drawn where motion is allowed (`MascotSparkles.css`), so under reduced motion it is absent.
 */
export default function MascotSparkles({ className }: { className?: string }) {
  return (
    <span className={className ? `mascot-sparkles ${className}` : 'mascot-sparkles'} aria-hidden="true">
      {Array.from({ length: MASCOT_SPARKLE_COUNT }, (_, index) => (
        <span
          key={index}
          className={`mascot-sparkles__item mascot-sparkles__item--${index % 2 === 0 ? 'coin' : 'star'}`}
          style={{
            '--sparkle-angle': `${SPREAD_START_DEG + index * (SPREAD_DEG / (MASCOT_SPARKLE_COUNT - 1))}deg`,
          } as CSSProperties}
        />
      ))}
    </span>
  );
}
