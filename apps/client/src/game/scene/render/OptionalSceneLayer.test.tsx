import { cleanup, render, screen } from '@testing-library/react';
import { lazy } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OptionalSceneLayer from './OptionalSceneLayer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Boom(): never {
  throw new Error('layer failed');
}

describe('OptionalSceneLayer', () => {
  it('renders its children when nothing goes wrong', () => {
    render(<OptionalSceneLayer name="test"><p>cosmetic</p></OptionalSceneLayer>);

    expect(screen.getByText('cosmetic')).toBeTruthy();
  });

  it('swallows an error from the layer, warns once, and keeps siblings alive', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <>
        <p>board</p>
        <OptionalSceneLayer name="environment"><Boom /></OptionalSceneLayer>
      </>,
    );

    expect(screen.getByText('board')).toBeTruthy();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('environment');
  });

  it('renders nothing while a lazy layer is loading instead of blocking the board', () => {
    const Pending = lazy(() => new Promise<never>(() => {}));
    const { container } = render(
      <>
        <p>board</p>
        <OptionalSceneLayer name="post"><Pending /></OptionalSceneLayer>
      </>,
    );

    expect(screen.getByText('board')).toBeTruthy();
    expect(container.textContent).toBe('board');
  });
});
