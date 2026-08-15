import { tileState } from '@monopoly/shared';
import {
  StrictMode, useId,
} from 'react';
import {
  cleanup, render, screen, waitFor,
} from '@testing-library/react';
import * as THREE from 'three';
import { getTileSurfaceStyle } from './tileTexture';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { useTileLabelTexture } from './BoardTile3D';

const fillText = vi.fn();
const context = {
  fillRect: vi.fn(),
  fillText,
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
    fillText.mockClear();
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

  it('prints the property name into the cached tile-face canvas', async () => {
    const { unmount } = render(<TextureConsumer hovered={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('texture-consumer').getAttribute('data-texture-id')).not.toBe('');
    });
    expect(fillText).toHaveBeenCalledWith('Cà Mau', expect.any(Number), expect.any(Number));
    unmount();
  });

  it('keeps group motifs distinct without adding 3D tile props', () => {
    expect(getTileSurfaceStyle(tileState[1]).motif).toBe('brick');
    expect(getTileSurfaceStyle(tileState[6]).motif).toBe('water');
    expect(getTileSurfaceStyle(tileState[16]).motif).toBe('market');
    expect(getTileSurfaceStyle(tileState[21]).motif).toBe('downtown');
  });
});
