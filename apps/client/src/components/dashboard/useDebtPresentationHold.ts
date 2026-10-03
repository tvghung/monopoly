import { useEffect, useState } from 'react';
import type { PublicGameState } from '@monopoly/shared';
import type { PresentationState } from '../../game/presentation/store/types';
import { usePresentationSelector } from '../../game/presentation/usePresentationSelector';

type DebtClaim = NonNullable<PublicGameState['boardState']['paymentShortfall']>;

/** A debt whose animations never report done is shown anyway after this long, so the player can never be left without it. */
export const DEBT_HOLD_FALLBACK_MS = 12_000;

/** What the debt window waits for: the queue, the tokens and the coins of the two players in the debt. */
interface DebtPresentationSlice {
  status: PresentationState['status'];
  settledPositions: PresentationState['settledPositions'];
  displayBalances: PresentationState['displayBalances'];
}

const selectSlice = (state: PresentationState): DebtPresentationSlice => ({
  status: state.status,
  settledPositions: state.settledPositions,
  displayBalances: state.displayBalances,
});
const sameSlice = (previous: DebtPresentationSlice, next: DebtPresentationSlice) => previous.status === next.status
  && previous.settledPositions === next.settledPositions
  && previous.displayBalances === next.displayBalances;

/**
 * True once what the board shows has caught up with the room state that carries the debt: nothing is playing or queued, the
 * debtor's token stands on the tile it landed on, and the debtor and the creditor show the cash the room state holds (the
 * coins and the plus and minus figures have finished). Authoritative values are compared with displayed ones, so the answer
 * is right in the render where the room state arrives, before the queue has even started.
 */
export function isDebtPresentationSettled(
  claim: DebtClaim,
  state: PublicGameState,
  slice: Pick<DebtPresentationSlice, 'status' | 'settledPositions' | 'displayBalances'>,
): boolean {
  if (slice.status !== 'idle') return false;
  const debtor = state.players[claim.debtorPlayerId];
  if (debtor && (slice.settledPositions[claim.debtorPlayerId] ?? debtor.currentTile) !== debtor.currentTile) return false;
  for (const playerId of [claim.debtorPlayerId, claim.creditorPlayerId]) {
    const player = playerId ? state.players[playerId] : undefined;
    if (playerId && player && (slice.displayBalances[playerId] ?? player.accountBalance) !== player.accountBalance) return false;
  }
  return true;
}

function claimKey(claim: DebtClaim | null): string | null {
  if (!claim) return null;
  return claim.paymentOperationId ?? `${claim.debtorPlayerId}:${claim.creditor}:${claim.source.kind}`;
}

/**
 * Whether the debt window ("Cần thanh toán", or the status line the other players see) must wait. The debt itself always
 * comes from authoritative state; this only decides the moment: after the token has hopped to the tile, the rent or tax
 * coins have flown and the figures have run down to what is left (V1.1 owner feedback item 1). Once a debt has been
 * released it stays released until it is paid, because the sales that follow play their own coins and the window must not
 * blink away under the player's hand. A reconnect or a snapshot has nothing to play, so it is shown at once.
 */
export default function useDebtPresentationHold(claim: DebtClaim | null, state: PublicGameState): boolean {
  const slice = usePresentationSelector(selectSlice, sameSlice);
  const key = claimKey(claim);
  const settled = claim ? isDebtPresentationSettled(claim, state, slice) : true;
  const [releasedKey, setReleasedKey] = useState<string | null>(null);

  // Adjusted during render, like the victory gate: no frame is drawn with the window held back after the animations ended.
  if (key === null && releasedKey !== null) setReleasedKey(null);
  else if (key !== null && settled && releasedKey !== key) setReleasedKey(key);

  const hold = key !== null && releasedKey !== key && !settled;
  useEffect(() => {
    if (!hold || key === null) return undefined;
    const timer = window.setTimeout(() => setReleasedKey(key), DEBT_HOLD_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [hold, key]);
  return hold;
}
