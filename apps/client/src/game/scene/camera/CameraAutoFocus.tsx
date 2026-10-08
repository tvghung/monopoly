import { useEffect, useRef } from 'react';
import { getBoardTileLayout } from '../board/boardLayout';
import { boardViewStore } from './boardView';

/** The part of the render model the follow rule reads: where each token is shown. */
interface PlayerPlace { playerId: string; tileId: number }

/** True while a dialog covers the board; the camera stays where the player left it then. */
function dialogIsOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('.ds-modal__overlay:not([hidden]):not([data-exiting])') !== null;
}

/**
 * Follows a token that moves while the board is zoomed in. It is deliberately timid: nothing happens at the overview (the whole
 * table is already in view), nothing within `MANUAL_PRECEDENCE_MS` of the player's own pinch, drag, zoom key or reset, nothing while a
 * dialog is open, and a move is one eased pan to the new tile, never a continuous chase. It reads only the displayed token
 * positions the board already animates, so it adds no second source of truth.
 */
export default function CameraAutoFocus({ players }: { players: readonly PlayerPlace[] }) {
  const seen = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    const previous = seen.current;
    const next = new Map(players.map(player => [player.playerId, player.tileId]));
    seen.current = next;
    if (!previous) return;
    for (const [playerId, tileId] of next) {
      const before = previous.get(playerId);
      if (before === undefined || before === tileId) continue;
      if (dialogIsOpen()) return;
      const layout = getBoardTileLayout(tileId);
      if (layout && boardViewStore.autoFocus(layout.position)) return;
    }
  }, [players]);

  return null;
}
