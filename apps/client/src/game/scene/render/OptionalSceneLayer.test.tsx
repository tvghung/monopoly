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

  it('tells its parent once when the layer failed, so a placeholder can take over', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onFail = vi.fn();
    render(<OptionalSceneLayer name="tube-houses" onFail={onFail}><Boom /></OptionalSceneLayer>);

    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('tries a failed layer again once its reset key changes, for example on a graphics tier change', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let broken = true;
    function Sometimes() {
      if (broken) throw new Error('layer failed');
      return <p>cosmetic</p>;
    }
    const { rerender } = render(
      <OptionalSceneLayer name="post" resetKey="high"><Sometimes /></OptionalSceneLayer>,
    );
    expect(screen.queryByText('cosmetic')).toBeNull();

    // The same key keeps the layer disabled, however often the parent renders.
    broken = false;
    rerender(<OptionalSceneLayer name="post" resetKey="high"><Sometimes /></OptionalSceneLayer>);
    expect(screen.queryByText('cosmetic')).toBeNull();

    rerender(<OptionalSceneLayer name="post" resetKey="balanced"><Sometimes /></OptionalSceneLayer>);
    expect(screen.getByText('cosmetic')).toBeTruthy();
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
