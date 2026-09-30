import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VISIBLE_TOASTS, ToastProvider, useToast } from './Toast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Emitter({ messages }: { messages: readonly string[] }) {
  const toast = useToast();
  useEffect(() => {
    messages.forEach(message => toast.show(message));
  }, [messages, toast]);
  return null;
}

describe('ToastProvider', () => {
  it('shows at most three toasts and lets the newest push the oldest out', () => {
    render(
      <ToastProvider>
        <Emitter messages={['Một', 'Hai', 'Ba', 'Bốn']} />
      </ToastProvider>,
    );
    expect(MAX_VISIBLE_TOASTS).toBe(3);
    expect(screen.queryByText('Một')).toBeNull();
    ['Hai', 'Ba', 'Bốn'].forEach(message => expect(screen.getByText(message)).toBeTruthy());
  });

  it('renders inside the top-centre container that sits under the HUD status pill', () => {
    const { container } = render(
      <ToastProvider>
        <Emitter messages={['Vị trí']} />
      </ToastProvider>,
    );
    expect(container.querySelector('.toast__container')).not.toBeNull();
  });
});
