import { useEffect, useRef, useState } from 'react';

// How long each single-tile hop takes while a piece walks the board.
const STEP_MS = 200;
// A normal dice move is 2..12 tiles. Anything longer forward is treated as a
// teleport (jail, advance to start, "go back" cards) and snaps instantly.
const MAX_WALK = 12;

const forwardDistance = (from: number, to: number): number => ((to - from) % 40 + 40) % 40;

// Given each player's authoritative tile from the server, return a "display" tile
// per player that walks one tile at a time toward the real position — restoring
// the field-by-field piece movement now that the server resolves moves at once.
export default function useSteppedPositions(
  actual: Record<string, number>,
  reducedMotion = false,
): Record<string, number> {
  const [display, setDisplay] = useState<Record<string, number>>(actual);
  const actualRef = useRef(actual);
  actualRef.current = actual;

  // Add pieces for new players (and drop ones who left) without animating them.
  useEffect(() => {
    if (reducedMotion) {
      setDisplay(actual);
      return;
    }
    setDisplay((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      Object.keys(actual).forEach((id) => {
        if (prev[id] === undefined) {
          next[id] = actual[id];
          changed = true;
        } else {
          next[id] = prev[id];
        }
      });
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      return changed ? next : prev;
    });
  }, [actual, reducedMotion]);

  // Step every lagging piece one tile forward on each tick.
  useEffect(() => {
    if (reducedMotion) return undefined;
    const interval = setInterval(() => {
      setDisplay((prev) => {
        const target = actualRef.current;
        let changed = false;
        const next = { ...prev };
        Object.keys(target).forEach((id) => {
          const current = prev[id];
          const goal = target[id];
          if (current === undefined || current === goal) return;
          const distance = forwardDistance(current, goal);
          // Snap teleports/backward jumps; walk normal dice moves one tile at a time.
          next[id] = distance === 0 || distance > MAX_WALK ? goal : (current + 1) % 40;
          changed = true;
        });
        return changed ? next : prev;
      });
    }, STEP_MS);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  return display;
}
