import { useSyncExternalStore } from 'react';

/**
 * Which dialogs are hidden by the "view board" (peek) key right now. A peeked dialog is only hidden: it stays mounted with all its
 * state and keeps its place in the dialog stack; this registry just knows who is hidden, so that
 *
 * - exactly one floating "show decision" key is drawn, the one of the dialog that was hidden last, and
 * - the board can tell that a pending decision is out of sight: while one is, what a player can open from the board is read-only
 *   (see `useDecisionHidden`).
 *
 * It holds no game state and sends nothing; presentation only.
 */
interface PeekEntry {
  id: symbol;
  /** The dialog is a pending decision of the game (a purchase, a debt, a card ...), not a tool such as a property card. */
  decision: boolean;
}

let entries: readonly PeekEntry[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Marks a dialog as hidden. The returned function marks it shown again; call it on restore and on unmount. */
export function registerPeek(id: symbol, decision: boolean): () => void {
  entries = [...entries.filter(entry => entry.id !== id), { id, decision }];
  emit();
  return () => {
    entries = entries.filter(entry => entry.id !== id);
    emit();
  };
}

/** True for the dialog hidden last: the only one that draws a "show decision" key. */
export function useOwnsRestoreKey(id: symbol): boolean {
  return useSyncExternalStore(subscribe, () => entries.at(-1)?.id === id, () => false);
}

/**
 * True while a dialog that holds a pending decision is hidden. The board stays usable for looking (property cards, portfolios,
 * rents), but the actions on those cards (sell a house, propose a trade) are withheld, because the decision is still open.
 */
export function useDecisionHidden(): boolean {
  return useSyncExternalStore(subscribe, () => entries.some(entry => entry.decision), () => false);
}

export function resetModalPeekForTests(): void {
  entries = [];
  emit();
}
