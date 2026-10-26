import { cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardViewStore } from './boardView';
import { useBoardGestures } from './useBoardGestures';

function GestureHarness({ tier = 'balanced' }: { tier?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useBoardGestures(ref, tier);
  return <div data-testid="gesture-surface" ref={ref} />;
}

function pointerEvent(
  type: string,
  values: Partial<Pick<PointerEvent, 'pointerId' | 'pointerType' | 'button' | 'clientX' | 'clientY'>> = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: values.pointerId ?? 1 },
    pointerType: { value: values.pointerType ?? 'mouse' },
    button: { value: values.button ?? 0 },
    clientX: { value: values.clientX ?? 0 },
    clientY: { value: values.clientY ?? 0 },
  });
  return event;
}

function startZoomedView(): void {
  boardViewStore.setFrame({ halfWidth: 100, halfHeight: 100 }, 0.02, true);
  boardViewStore.setManual({ zoom: 2, panX: 0, panY: 0 }, 0);
}

function dispatchPointer(
  target: EventTarget,
  type: string,
  values: Partial<Pick<PointerEvent, 'pointerId' | 'pointerType' | 'button' | 'clientX' | 'clientY'>> = {},
): void {
  target.dispatchEvent(pointerEvent(type, values));
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  boardViewStore.resetForTests();
  vi.restoreAllMocks();
});

describe('useBoardGestures pointer lifecycle', () => {
  it('pans at the existing sensitivity for a left mouse drag', () => {
    startZoomedView();
    const surface = render(<GestureHarness />).getByTestId('gesture-surface');

    dispatchPointer(surface, 'pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 20 });
    dispatchPointer(surface, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 26, clientY: 20 });

    expect(boardViewStore.getView()).toEqual({ zoom: 2, panX: -0.16, panY: 0 });
    dispatchPointer(surface, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 26, clientY: 20 });
  });

  it('ends the drag when release happens outside the surface and does not resume on re-entry', () => {
    startZoomedView();
    const surface = render(<GestureHarness />).getByTestId('gesture-surface');
    const outside = document.createElement('div');
    document.body.append(outside);

    dispatchPointer(surface, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    dispatchPointer(surface, 'pointermove', { pointerId: 1, clientX: 22, clientY: 10 });
    dispatchPointer(outside, 'pointerup', { pointerId: 1, clientX: 22, clientY: 10 });
    const releasedView = { ...boardViewStore.getView() };
    dispatchPointer(surface, 'pointermove', { pointerId: 1, clientX: 80, clientY: 40 });

    expect(boardViewStore.getView()).toEqual(releasedView);
    outside.remove();
  });

  it('ends the canceled pointer when pointercancel is delivered outside', () => {
    startZoomedView();
    const surface = render(<GestureHarness />).getByTestId('gesture-surface');
    const outside = document.createElement('div');
    document.body.append(outside);

    dispatchPointer(surface, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
    dispatchPointer(surface, 'pointermove', { pointerId: 1, pointerType: 'touch', clientX: 22, clientY: 10 });
    dispatchPointer(outside, 'pointercancel', { pointerId: 1, pointerType: 'touch', clientX: 22, clientY: 10 });
    const canceledView = { ...boardViewStore.getView() };
    dispatchPointer(surface, 'pointermove', { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 40 });

    expect(boardViewStore.getView()).toEqual(canceledView);
    outside.remove();
  });

  it('rebases the remaining touch when one pointer loses capture', () => {
    startZoomedView();
    const surface = render(<GestureHarness />).getByTestId('gesture-surface');
    const outside = document.createElement('div');
    document.body.append(outside);

    dispatchPointer(surface, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    dispatchPointer(surface, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 });
    dispatchPointer(surface, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 220, clientY: 100 });
    dispatchPointer(outside, 'lostpointercapture', { pointerId: 2, pointerType: 'touch', clientX: 220, clientY: 100 });
    const afterLostCapture = { ...boardViewStore.getView() };
    dispatchPointer(surface, 'pointermove', { pointerId: 1, pointerType: 'touch', clientX: 112, clientY: 100 });

    expect(boardViewStore.getView().zoom).toBe(afterLostCapture.zoom);
    expect(boardViewStore.getView().panX).not.toBe(afterLostCapture.panX);
    outside.remove();
  });

  it('keeps an unowned pointer from changing a touch drag after the other finger releases outside', () => {
    startZoomedView();
    const surface = render(<GestureHarness />).getByTestId('gesture-surface');
    const outside = document.createElement('div');
    document.body.append(outside);

    dispatchPointer(surface, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    dispatchPointer(surface, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 });
    dispatchPointer(surface, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 220, clientY: 100 });
    dispatchPointer(outside, 'pointerup', { pointerId: 2, pointerType: 'touch', clientX: 220, clientY: 100 });
    const afterRelease = { ...boardViewStore.getView() };
    dispatchPointer(surface, 'pointermove', { pointerId: 3, pointerType: 'touch', clientX: 300, clientY: 300 });
    expect(boardViewStore.getView()).toEqual(afterRelease);

    dispatchPointer(surface, 'pointermove', { pointerId: 1, pointerType: 'touch', clientX: 112, clientY: 100 });
    expect(boardViewStore.getView().panX).not.toBe(afterRelease.panX);
    outside.remove();
  });

  it('clears active pointers on window blur', () => {
    startZoomedView();
    const surface = render(<GestureHarness />).getByTestId('gesture-surface');

    dispatchPointer(surface, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    dispatchPointer(surface, 'pointermove', { pointerId: 1, clientX: 22, clientY: 10 });
    window.dispatchEvent(new Event('blur'));
    const blurredView = { ...boardViewStore.getView() };
    dispatchPointer(surface, 'pointermove', { pointerId: 1, clientX: 80, clientY: 40 });

    expect(boardViewStore.getView()).toEqual(blurredView);
  });

  it('supports rapid independent drags and ignores non-left mouse input', () => {
    startZoomedView();
    const surface = render(<GestureHarness />).getByTestId('gesture-surface');

    dispatchPointer(surface, 'pointerdown', { pointerId: 8, pointerType: 'mouse', button: 2, clientX: 0, clientY: 0 });
    dispatchPointer(surface, 'pointermove', { pointerId: 8, pointerType: 'mouse', clientX: 40, clientY: 0 });
    dispatchPointer(surface, 'pointerup', { pointerId: 8, pointerType: 'mouse' });
    expect(boardViewStore.getView()).toEqual({ zoom: 2, panX: 0, panY: 0 });

    for (let index = 0; index < 3; index += 1) {
      const pointerId = index + 10;
      const x = index * 30;
      dispatchPointer(surface, 'pointerdown', { pointerId, pointerType: 'mouse', button: 0, clientX: x, clientY: 0 });
      dispatchPointer(surface, 'pointermove', { pointerId, pointerType: 'mouse', clientX: x + 12, clientY: 0 });
      dispatchPointer(surface, 'pointerup', { pointerId, pointerType: 'mouse' });
    }

    expect(boardViewStore.getView().panX).toBeCloseTo(-0.36);
  });

  it('removes window listeners and stops reacting after unmount', () => {
    startZoomedView();
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<GestureHarness />);
    const surface = screen.getByTestId('gesture-surface');
    dispatchPointer(surface, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    view.unmount();
    const beforeEvents = { ...boardViewStore.getView() };

    dispatchPointer(window, 'pointerup', { pointerId: 1 });
    dispatchPointer(surface, 'pointermove', { pointerId: 1, clientX: 70, clientY: 30 });

    expect(remove).toHaveBeenCalledWith('pointerup', expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith('pointercancel', expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith('lostpointercapture', expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(boardViewStore.getView()).toEqual(beforeEvents);
  });

  it('starts with no active pointer after the gesture surface is remounted', () => {
    startZoomedView();
    const first = render(<GestureHarness />);
    const firstSurface = first.getByTestId('gesture-surface');
    dispatchPointer(firstSurface, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    dispatchPointer(firstSurface, 'pointermove', { pointerId: 1, clientX: 22, clientY: 10 });
    first.unmount();

    const secondSurface = render(<GestureHarness />).getByTestId('gesture-surface');
    const beforeUnownedMove = { ...boardViewStore.getView() };
    dispatchPointer(secondSurface, 'pointermove', { pointerId: 1, clientX: 80, clientY: 40 });
    expect(boardViewStore.getView()).toEqual(beforeUnownedMove);

    dispatchPointer(secondSurface, 'pointerdown', { pointerId: 1, clientX: 40, clientY: 40 });
    dispatchPointer(secondSurface, 'pointermove', { pointerId: 1, clientX: 52, clientY: 40 });
    expect(boardViewStore.getView().panX).not.toBe(beforeUnownedMove.panX);
  });

  it('resets active pointers when the graphics tier changes', () => {
    startZoomedView();
    const view = render(<GestureHarness tier="balanced" />);
    let surface = view.getByTestId('gesture-surface');
    dispatchPointer(surface, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    dispatchPointer(surface, 'pointermove', { pointerId: 1, clientX: 22, clientY: 10 });
    const beforeTierChange = { ...boardViewStore.getView() };

    view.rerender(<GestureHarness tier="high" />);
    surface = view.getByTestId('gesture-surface');
    dispatchPointer(surface, 'pointermove', { pointerId: 1, clientX: 80, clientY: 40 });
    expect(boardViewStore.getView()).toEqual(beforeTierChange);

    dispatchPointer(surface, 'pointerdown', { pointerId: 1, clientX: 40, clientY: 40 });
    dispatchPointer(surface, 'pointermove', { pointerId: 1, clientX: 52, clientY: 40 });
    expect(boardViewStore.getView().panX).not.toBe(beforeTierChange.panX);
  });
});
