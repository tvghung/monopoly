import type { ComponentType } from 'react';
import { cleanup, render } from '@testing-library/react';
import { tileState } from '@monopoly/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoardTileLayout } from '../board/boardLayout';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

type Visual = ComponentType<{ panel: TilePanelLayout }>;

const merges = { count: 0 };
let JailVisual: Visual;
let TaxVisual: Visual;
let getOrientedPanel: (size: readonly [number, number], side: Parameters<typeof import('../board/tiles/tilePanelLayout').getOrientedTilePanelLayoutForTileSize>[1]) => TilePanelLayout;

// `mergeGeometries` is what bakes every merged rounded-box mesh, so counting its calls counts geometry rebuilds. The module
// registry is reset first so the mock applies whichever test file ran before in the same worker.
beforeEach(async () => {
  merges.count = 0;
  vi.resetModules();
  vi.doMock('three/addons/utils/BufferGeometryUtils.js', async importOriginal => {
    const actual = await importOriginal<typeof import('three/addons/utils/BufferGeometryUtils.js')>();
    return {
      ...actual,
      mergeGeometries: (...args: Parameters<typeof actual.mergeGeometries>) => {
        merges.count += 1;
        return actual.mergeGeometries(...args);
      },
    };
  });
  ({ default: JailVisual } = await import('./JailVisual'));
  ({ default: TaxVisual } = await import('./TaxVisual'));
  ({ getOrientedTilePanelLayoutForTileSize: getOrientedPanel } = await import('../board/tiles/tilePanelLayout'));
});

afterEach(() => {
  cleanup();
  vi.doUnmock('three/addons/utils/BufferGeometryUtils.js');
});

const jailTileId = tileState.findIndex(tile => tile.tileType === 'jail');
const taxTileIds = tileState.flatMap((tile, tileId) => (tile.tileType === 'expense' ? [tileId] : []));

/** What `TileAssembly` does on every board render: derive the panel from the tile layout and hand it to the visual. */
function Assembly({ tileId, Visual: Special, cloneThePanel = false }: { tileId: number; Visual: Visual; cloneThePanel?: boolean }) {
  const layout = getBoardTileLayout(tileId)!;
  const panel = getOrientedPanel(layout.size, layout.side);
  return <Special panel={cloneThePanel ? { ...panel } : panel} />;
}

describe('special tile visuals do not rebuild their merged geometry on board re-renders (audit PERF-02)', () => {
  it('there are special tiles to test', () => {
    expect(jailTileId).toBeGreaterThanOrEqual(0);
    expect(taxTileIds.length).toBeGreaterThan(0);
  });

  it('builds the Jail cell once, however many times the board re-renders', () => {
    const { rerender } = render(<Assembly tileId={jailTileId} Visual={JailVisual} />);
    expect(merges.count).toBe(1);
    for (let boardRender = 0; boardRender < 20; boardRender += 1) {
      rerender(<Assembly tileId={jailTileId} Visual={JailVisual} />);
    }
    expect(merges.count).toBe(1);
  });

  it('builds the Tax papers and marks once each (two merged meshes), however many times the board re-renders', () => {
    const { rerender } = render(<Assembly tileId={taxTileIds[0]} Visual={TaxVisual} />);
    expect(merges.count).toBe(2);
    for (let boardRender = 0; boardRender < 20; boardRender += 1) {
      rerender(<Assembly tileId={taxTileIds[0]} Visual={TaxVisual} />);
    }
    expect(merges.count).toBe(2);
  });

  it('stays built even if a caller hands over a new but equal panel object every render', () => {
    const jail = render(<Assembly tileId={jailTileId} Visual={JailVisual} cloneThePanel />);
    for (let boardRender = 0; boardRender < 10; boardRender += 1) {
      jail.rerender(<Assembly tileId={jailTileId} Visual={JailVisual} cloneThePanel />);
    }
    expect(merges.count).toBe(1);
    merges.count = 0;
    const tax = render(<Assembly tileId={taxTileIds[0]} Visual={TaxVisual} cloneThePanel />);
    for (let boardRender = 0; boardRender < 10; boardRender += 1) {
      tax.rerender(<Assembly tileId={taxTileIds[0]} Visual={TaxVisual} cloneThePanel />);
    }
    expect(merges.count).toBe(2);
  });

  it('builds a new geometry only when the panel really changes', () => {
    const layout = getBoardTileLayout(jailTileId)!;
    const panel = getOrientedPanel(layout.size, layout.side);
    const view = render(<JailVisual panel={panel} />);
    expect(merges.count).toBe(1);
    view.rerender(<JailVisual panel={getOrientedPanel([layout.size[0] * 1.2, layout.size[1]], layout.side)} />);
    expect(merges.count).toBe(2);
  });

  it('still renders the same meshes it always did', () => {
    const jail = render(<Assembly tileId={jailTileId} Visual={JailVisual} />);
    expect(jail.container.querySelector('group[name="JailCellBars2D"] mesh[name="JailCellMerged"]')).not.toBeNull();
    cleanup();
    const tax = render(<Assembly tileId={taxTileIds[0]} Visual={TaxVisual} />);
    expect(tax.container.querySelector('mesh[name="TaxPapers"]')).not.toBeNull();
    expect(tax.container.querySelector('mesh[name="TaxPaperMarks"]')).not.toBeNull();
  });
});
