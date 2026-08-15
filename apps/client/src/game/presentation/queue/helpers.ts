export function waitForDelay(duration: number, signal: AbortSignal): Promise<void> {
  if (duration <= 0) return Promise.resolve();
  if (signal.aborted) return Promise.reject(new DOMException('Animation aborted.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, duration);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Animation aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

