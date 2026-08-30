import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fiber = vi.hoisted(() => ({ useThree: vi.fn() }));

vi.mock('@react-three/fiber', async importOriginal => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  useThree: fiber.useThree,
}));

import { RendererLifecycleGuard } from './GameScene';

afterEach(() => {
  fiber.useThree.mockReset();
});

describe('RendererLifecycleGuard', () => {
  it('reports WebGL context loss and removes its listener on unmount', () => {
    const canvas = document.createElement('canvas');
    const onFailure = vi.fn();
    fiber.useThree.mockReturnValue({ domElement: canvas });
    const view = render(<RendererLifecycleGuard onFailure={onFailure} />);
    const lost = new Event('webglcontextlost', { cancelable: true });

    canvas.dispatchEvent(lost);

    expect(lost.defaultPrevented).toBe(true);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      message: 'WebGL context was lost',
    }));

    view.unmount();
    onFailure.mockClear();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onFailure).not.toHaveBeenCalled();
  });
});
