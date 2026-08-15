import { tileState } from '@monopoly/shared';
import {
  StrictMode, useId,
} from 'react';
import {
  cleanup, render, screen, waitFor,
} from '@testing-library/react';
import * as THREE from 'three';
import { getTileSurfaceStyle, getTileTextureAnisotropy } from './tileTexture';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { useTileLabelTexture } from './BoardTile3D';

const fillText = vi.fn<(text: string, x: number, y: number) => void>();
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
      data-min-filter={texture?.minFilter ?? ''}
      data-anisotropy={texture?.anisotropy ?? ''}
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
    const drawnText = fillText.mock.calls.map(([text]) => text);
    expect(drawnText).toContain('Cà Mau');
    expect(drawnText).toContain('60.000 ₫');
    expect(drawnText).not.toContain('BẤT ĐỘNG SẢN');
    unmount();
  });

  it('uses a sharper mip filter and the configured anisotropy without recreating on hover', async () => {
    const { rerender, unmount } = render(<TextureConsumer hovered={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('texture-consumer').getAttribute('data-texture-id')).not.toBe('');
    });
    const textureConsumer = screen.getByTestId('texture-consumer');
    expect(textureConsumer.getAttribute('data-min-filter'))
      .toBe(String(THREE.LinearMipmapNearestFilter));
    expect(textureConsumer.getAttribute('data-anisotropy')).toBe('4');

    rerender(<TextureConsumer hovered />);
    expect(screen.getByTestId('texture-consumer').getAttribute('data-texture-id'))
      .toBe(textureConsumer.getAttribute('data-texture-id'));
    unmount();
  });

  it('keeps group motifs distinct without adding 3D tile props', () => {
    expect(getTileSurfaceStyle(tileState[1]).motif).toBe('brick');
    expect(getTileSurfaceStyle(tileState[6]).motif).toBe('water');
    expect(getTileSurfaceStyle(tileState[16]).motif).toBe('market');
    expect(getTileSurfaceStyle(tileState[21]).motif).toBe('downtown');
  });

  it('clamps renderer anisotropy to a practical quality cap', () => {
    expect(getTileTextureAnisotropy(16)).toBe(8);
    expect(getTileTextureAnisotropy(4)).toBe(4);
    expect(getTileTextureAnisotropy(Number.NaN)).toBe(1);
  });
});
