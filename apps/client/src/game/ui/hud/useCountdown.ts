import { useEffect, useState } from 'react';

/** Formats whole seconds as `m:ss`. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Seconds left until `deadlineAt` (an ISO timestamp), or `null` when there is no deadline. The HUD only displays
 * this; the server owns the deadline. One 1-second interval runs while a deadline exists.
 */
export function useCountdownSeconds(deadlineAt: string | null, now: () => number = Date.now): number | null {
  const deadline = deadlineAt === null ? null : Date.parse(deadlineAt);
  const [current, setCurrent] = useState(() => now());

  useEffect(() => {
    if (deadline === null || Number.isNaN(deadline)) return undefined;
    setCurrent(now());
    const timer = setInterval(() => setCurrent(now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, now]);

  if (deadline === null || Number.isNaN(deadline)) return null;
  return Math.max(0, (deadline - current) / 1000);
}
