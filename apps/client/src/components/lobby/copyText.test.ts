import { act, renderHook } from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { COPIED_NOTICE_MS, copyText, useCopyFeedback } from './copyText';

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

function setExecCommand(value: unknown): void {
  Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value });
}

/** Presses copy and lets the clipboard promise settle inside act. */
async function copyAndSettle(copy: (value: string) => void): Promise<void> {
  await act(async () => {
    copy('ROOM-1');
    await Promise.resolve();
  });
}

beforeEach(() => {
  setClipboard(undefined);
  setExecCommand(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  setClipboard(undefined);
  setExecCommand(undefined);
});

describe('copyText', () => {
  it('writes with the async clipboard when it is there', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    await expect(copyText('ROOM-1')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('ROOM-1');
  });

  it('falls back to a DOM selection copy when the clipboard permission is denied', async () => {
    setClipboard({ writeText: vi.fn(() => Promise.reject(new Error('denied'))) });
    const execCommand = vi.fn(() => true);
    setExecCommand(execCommand);
    await expect(copyText('ROOM-1')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when neither way works', async () => {
    await expect(copyText('ROOM-1')).resolves.toBe(false);
  });
});

describe('useCopyFeedback', () => {
  it('shows "copied" and clears it by itself', async () => {
    vi.useFakeTimers();
    setClipboard({ writeText: vi.fn(() => Promise.resolve()) });
    const { result } = renderHook(() => useCopyFeedback());
    expect(result.current.state).toBe('idle');

    await copyAndSettle(result.current.copy);
    expect(result.current.state).toBe('copied');

    act(() => { vi.advanceTimersByTime(COPIED_NOTICE_MS - 1); });
    expect(result.current.state).toBe('copied');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.state).toBe('idle');
  });

  it('keeps a failure on screen until the next try, because the player has to act on it', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCopyFeedback());

    await copyAndSettle(result.current.copy);
    expect(result.current.state).toBe('failed');
    act(() => { vi.advanceTimersByTime(COPIED_NOTICE_MS * 4); });
    expect(result.current.state).toBe('failed');

    setClipboard({ writeText: vi.fn(() => Promise.resolve()) });
    await copyAndSettle(result.current.copy);
    expect(result.current.state).toBe('copied');
  });
});
