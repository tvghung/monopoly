import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SceneErrorBoundary from './SceneErrorBoundary';

afterEach(cleanup);

function BrokenScene(): never {
  throw new Error('forced renderer failure');
}

describe('SceneErrorBoundary', () => {
  it('reports renderer errors and renders the legacy fallback', () => {
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <SceneErrorBoundary
        fallback={<p>Legacy board fallback</p>}
        onError={onError}
      >
        <BrokenScene />
      </SceneErrorBoundary>,
    );

    expect(screen.getByText('Legacy board fallback')).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'forced renderer failure' }));
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
