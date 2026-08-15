import { tileState } from '@monopoly/shared';
import {
  StrictMode, useId,
} from 'react';
import {
  cleanup, render, screen, waitFor,
} from '@testing-library/react';
import * as THREE from 'three';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { useTileLabelTexture } from './BoardTile3D';

const context = {
  fillRect: vi.fn(),
  fillText: vi.fn(),
  measureText: (text: string) => ({ width: text.length * 10 }),
  strokeRect: vi.fn(),
} as unknown as CanvasRenderingContext2D;

function TextureConsumer({ hovered }: { hovered: boolean }) {
  const instanceId = useId();
  const texture = useTileLabelTexture(1, tileState[1], true);
  return (
    <span
      data-testid="texture-consumer"
      data-instance-id={instanceId}
      data-texture-id={texture?.uuid ?? ''}
      data-hovered={hovered}
    />
  );
}

describe('tile texture lifecycle', () => {
  let getContext: ReturnType<typeof vi.fn>;
  let dispose: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getContext = vi.fn(() => context);
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: getContext,
    });
    dispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not allocate during render churn and disposes once after the last committed user', async () => {
    const { rerender, unmount } = render(
      <StrictMode>
        <TextureConsumer hovered={false} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('texture-consumer').getAttribute('data-texture-id')).not.toBe('');
    });
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();

    rerender(
      <StrictMode>
        <TextureConsumer hovered />
      </StrictMode>,
    );
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  });
});
