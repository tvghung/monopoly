import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRollShortcutAllowed, useRollShortcut } from './useRollShortcut';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function press(target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    code: 'Space', key: ' ', bubbles: true, cancelable: true, ...init,
  });
  act(() => { target.dispatchEvent(event); });
  return event;
}

function Probe({ enabled, onRoll }: { enabled: boolean; onRoll: () => void }) {
  useRollShortcut(enabled, onRoll);
  return null;
}

describe('roll shortcut', () => {
  it('rolls on Space while the call to action is enabled and prevents page scrolling', () => {
    const onRoll = vi.fn();
    render(<Probe enabled onRoll={onRoll} />);
    const event = press(document.body);
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing while the roll is not enabled', () => {
    const onRoll = vi.fn();
    render(<Probe enabled={false} onRoll={onRoll} />);
    press(document.body);
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('ignores Space typed into inputs, textareas, selects and contenteditable elements', () => {
    const onRoll = vi.fn();
    render(<Probe enabled onRoll={onRoll} />);
    for (const html of ['<input />', '<textarea></textarea>', '<select><option>a</option></select>', '<div contenteditable="true"></div>']) {
      document.body.insertAdjacentHTML('beforeend', html);
    }
    document.body.querySelectorAll('input, textarea, select, div[contenteditable]').forEach(element => press(element));
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('ignores Space on another button or link so it keeps its own meaning', () => {
    const onRoll = vi.fn();
    render(<Probe enabled onRoll={onRoll} />);
    document.body.insertAdjacentHTML('beforeend', '<button>Cài đặt</button><a href="#x">liên kết</a>');
    document.body.querySelectorAll('button, a').forEach(element => press(element));
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('ignores Space while a dialog is open', () => {
    const onRoll = vi.fn();
    render(<Probe enabled onRoll={onRoll} />);
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-label="Cài đặt"></div>');
    press(document.body);
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('ignores repeats, modified presses and other keys', () => {
    const onRoll = vi.fn();
    render(<Probe enabled onRoll={onRoll} />);
    press(document.body, { repeat: true });
    press(document.body, { ctrlKey: true });
    press(document.body, { shiftKey: true });
    press(document.body, { code: 'Enter', key: 'Enter' });
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('stops listening when it is disabled or unmounted', () => {
    const onRoll = vi.fn();
    const { rerender, unmount } = render(<Probe enabled onRoll={onRoll} />);
    rerender(<Probe enabled={false} onRoll={onRoll} />);
    press(document.body);
    rerender(<Probe enabled onRoll={onRoll} />);
    unmount();
    press(document.body);
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('exposes the same rule as a pure predicate', () => {
    expect(isRollShortcutAllowed(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))).toBe(true);
    expect(isRollShortcutAllowed(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a' }))).toBe(false);
  });
});
