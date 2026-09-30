import { useEffect, useRef } from 'react';

/** Elements that use the Space key themselves: typing, choosing, or pressing another control. */
const INTERACTIVE_TARGET = 'input, textarea, select, button, a[href], summary, [contenteditable], [role="button"], [role="textbox"], [role="switch"], [role="radio"], [role="checkbox"], [role="slider"], [role="combobox"], [role="menuitem"], [role="tab"]';
const OPEN_DIALOG = '[role="dialog"], [role="alertdialog"], dialog[open]';

/**
 * Whether a Space key press may trigger the roll: no modifier, not a key repeat, not already handled, focus is not on
 * something that uses Space itself, and no dialog is open.
 */
export function isRollShortcutAllowed(event: KeyboardEvent, root: Document = document): boolean {
  if (event.code !== 'Space' && event.key !== ' ') return false;
  if (event.repeat || event.defaultPrevented) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const target = event.target;
  if (target instanceof Element && target.closest(INTERACTIVE_TARGET)) return false;
  if (root.querySelector(OPEN_DIALOG)) return false;
  return true;
}

/**
 * `Space` triggers the roll call to action while it is enabled (plan 03 OD-03-5). The listener is on the document and
 * never runs while typing or while a dialog is open.
 */
export function useRollShortcut(enabled: boolean, onRoll: () => void): void {
  const rollRef = useRef(onRoll);
  useEffect(() => {
    rollRef.current = onRoll;
  }, [onRoll]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isRollShortcutAllowed(event)) return;
      event.preventDefault();
      rollRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
