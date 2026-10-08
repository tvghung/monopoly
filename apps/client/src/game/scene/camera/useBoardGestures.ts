import { useEffect, type RefObject } from 'react';
import { boardViewStore } from './boardView';

/** Movement (CSS px) after which a pointer sequence is a drag and not a tap; the click that ends a drag is swallowed. */
const DRAG_THRESHOLD_PX = 8;
/** A click this soon after a drag/pinch ended belongs to it. */
const CLICK_AFTER_GESTURE_MS = 350;
/** Wheel: one notch (about 100) is a 16% zoom step. */
const WHEEL_ZOOM_PER_PIXEL = 0.0015;

/**
 * Touch and mouse gestures of the board camera, attached to the element that holds the canvas: one pointer drags the zoomed board,
 * two pointers pinch (zoom about their midpoint, pan with it), the wheel zooms about the cursor. Everything goes to
 * `boardViewStore`, which never touches game state; a tap that was a drag does not reach the tiles (the capture-phase click is
 * stopped), so panning cannot open a property or send anything. At zoom 1 a drag does nothing, so a plain tap is always a tap.
 */
export function useBoardGestures(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const pointers = new Map<number, { x: number; y: number }>();
    let last: { x: number; y: number } | null = null;
    let pinch: { distance: number } | null = null;
    let moved = 0;
    let gestureEndedAt = Number.NEGATIVE_INFINITY;

    const center = () => {
      const box = element.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    const midpoint = () => {
      const [a, b] = [...pointers.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const distance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        moved = 0;
        last = { x: event.clientX, y: event.clientY };
      } else if (pointers.size === 2) {
        pinch = { distance: Math.max(1, distance()) };
        last = midpoint();
        moved = DRAG_THRESHOLD_PX + 1;
      }
    };

    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2 && pinch && last) {
        const mid = midpoint();
        const nextDistance = Math.max(1, distance());
        const c = center();
        // Zoom about the fingers, then follow their midpoint.
        boardViewStore.zoomAt(nextDistance / pinch.distance, { x: mid.x - c.x, y: mid.y - c.y });
        boardViewStore.panPixels(mid.x - last.x, mid.y - last.y);
        pinch = { distance: nextDistance };
        last = mid;
        return;
      }
      if (pointers.size === 1 && last) {
        const dx = event.clientX - last.x;
        const dy = event.clientY - last.y;
        moved += Math.abs(dx) + Math.abs(dy);
        // Only a zoomed-in board can be moved; at the overview a drag is just a slipping tap and stays one.
        if (boardViewStore.getView().zoom <= 1.001) return;
        if (moved < DRAG_THRESHOLD_PX) return;
        boardViewStore.panPixels(dx, dy);
        last = { x: event.clientX, y: event.clientY };
      }
    };

    const onUp = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      if (moved >= DRAG_THRESHOLD_PX && (boardViewStore.getView().zoom > 1.001 || pinch)) gestureEndedAt = performance.now();
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        const [rest] = [...pointers.values()];
        last = { ...rest };
      } else {
        last = null;
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const c = center();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_PER_PIXEL);
      boardViewStore.zoomAt(factor, { x: event.clientX - c.x, y: event.clientY - c.y });
    };

    const onClickCapture = (event: MouseEvent) => {
      if (performance.now() - gestureEndedAt > CLICK_AFTER_GESTURE_MS) return;
      event.stopPropagation();
      event.preventDefault();
      gestureEndedAt = Number.NEGATIVE_INFINITY;
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('click', onClickCapture, true);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('click', onClickCapture, true);
    };
  }, [ref]);
}
