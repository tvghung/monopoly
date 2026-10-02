import { useCallback, useEffect, useRef, useState } from 'react';

function fallbackCopy(value: string): boolean {
  const input = document.createElement('textarea');
  input.value = value;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand?.('copy') ?? false;
  input.remove();
  return copied;
}

/** Copies text with the async clipboard, falling back to a DOM selection when permission is denied. */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // The DOM copy fallback below still works when clipboard permission is denied.
  }
  return fallbackCopy(value);
}

export type CopyState = 'idle' | 'copied' | 'failed';

/** How long "Đã sao chép." stays up; a failure stays until the next try because the player has to act on it. */
export const COPIED_NOTICE_MS = 2500;

/** One copy action with its status: `copied` clears itself, `failed` does not. */
export function useCopyFeedback(): { state: CopyState; copy: (value: string) => void } {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback((value: string) => {
    window.clearTimeout(timer.current);
    void copyText(value).then(copied => {
      if (!mounted.current) return;
      setState(copied ? 'copied' : 'failed');
      if (copied) timer.current = window.setTimeout(() => setState('idle'), COPIED_NOTICE_MS);
    });
  }, []);

  return { state, copy };
}
