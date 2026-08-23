import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getPlayerDisplayColor } from '../../../ui/playerVisualColors';
import { TILE_SURFACE_Y } from '../boardLayout';
import {
  OWNERSHIP_FLAG_CLOTH_DEPTH,
  OWNERSHIP_FLAG_CLOTH_WIDTH,
  OWNERSHIP_FLAG_POLE_WIDTH,
  getOwnershipFlagClothColor,
  getOwnershipFlagPopScale,
  getOwnershipFlagPlacement,
} from './OwnershipFlag';
import TileOwnershipLayer from './TileOwnershipLayer';
import { getOrientedTilePanelLayoutForTileSize } from './tilePanelLayout';

const size = [1.5, 2.4] as const;
const panel = getOrientedTilePanelLayoutForTileSize(size, 'BOTTOM');

function renderLayer(ownerColor: string | undefined, selected = false) {
  return render(
    <TileOwnershipLayer
      ownerColor={ownerColor}
      size={size}
      panel={panel}
      selected={selected}
    />,
  );
}

function getFlagMesh(container: HTMLElement): Element | null {
  return container.querySelector('mesh[name="FlagPoleAndCloth"]');
}

describe('tile ownership layer', () => {
  it('renders no flag or selection feedback for an unowned unselected tile', () => {
    const { container } = renderLayer(undefined);

    expect(container.querySelector('group[name="TileOwnershipLayer"]')).not.toBeNull();
    expect(container.querySelector('group[name="OwnershipFlag"]')).toBeNull();
    expect(container.querySelector('[name="OwnerTab"]')).toBeNull();
    expect(container.querySelector('group[name="TileOwnershipLayer"] > group')).toBeNull();
  });

  it('renders a planted flag without selection feedback for an owned tile', () => {
    const { container } = renderLayer('red');

    expect(container.querySelector('group[name="OwnershipFlag"]')).not.toBeNull();
    expect(container.querySelector('[name="OwnerTab"]')).toBeNull();
    expect(container.querySelector('group[name="TileOwnershipLayer"] > group + group')).toBeNull();
  });

  it('preserves selected-tile feedback independently from ownership', () => {
    const { container } = renderLayer('blue', true);

    expect(container.querySelector('group[name="OwnershipFlag"]')).not.toBeNull();
    expect(container.querySelector('group[name="TileOwnershipLayer"] > group + group')).not.toBeNull();
    expect(container.querySelector('[name="OwnerTab"]')).toBeNull();
  });

  it('renders selection feedback without a flag for an unowned selected tile', () => {
    const { container } = renderLayer(undefined, true);

    expect(container.querySelector('group[name="OwnershipFlag"]')).toBeNull();
    expect(container.querySelector('group[name="TileOwnershipLayer"] > group')).not.toBeNull();
  });

  it('uses the canonical player display color for the flag cloth', () => {
    const { container } = renderLayer('red');

    expect(getOwnershipFlagClothColor('red')).toBe(getPlayerDisplayColor('red'));
    expect(getFlagMesh(container)).not.toBeNull();
  });

  it('updates the flag cloth when authoritative ownership color changes', () => {
    const view = renderLayer('red');
    expect(getOwnershipFlagClothColor('red')).toBe(getPlayerDisplayColor('red'));

    view.rerender(
      <TileOwnershipLayer
        ownerColor="blue"
        size={size}
        panel={panel}
        selected={false}
      />,
    );
    expect(getOwnershipFlagClothColor('blue')).toBe(getPlayerDisplayColor('blue'));
    expect(getFlagMesh(view.container)).not.toBeNull();
  });

  it('uses a deterministic overshoot and settles the ownership flag at full scale', () => {
    expect(getOwnershipFlagPopScale(0)).toBe(0);
    expect(getOwnershipFlagPopScale(0.56)).toBeGreaterThan(1);
    expect(getOwnershipFlagPopScale(1)).toBe(1);
    expect(getOwnershipFlagPopScale(2)).toBe(1);
  });

  it('removes the flag when authoritative ownership is removed', () => {
    const view = renderLayer('red');
    expect(view.container.querySelector('group[name="OwnershipFlag"]')).not.toBeNull();

    view.rerender(
      <TileOwnershipLayer
        ownerColor={undefined}
        size={size}
        panel={panel}
        selected={false}
      />,
    );
    expect(view.container.querySelector('group[name="OwnershipFlag"]')).toBeNull();
  });

  it('keeps the flag inside the upper outer footprint and above the tile surface on every edge', () => {
    (['BOTTOM', 'LEFT', 'TOP', 'RIGHT'] as const).forEach(side => {
      const sidePanel = getOrientedTilePanelLayoutForTileSize(size, side);
      const placement = getOwnershipFlagPlacement(sidePanel);
      const leftEdge = placement.position[0] - OWNERSHIP_FLAG_POLE_WIDTH / 2;
      const rightEdge = placement.position[0]
        + OWNERSHIP_FLAG_POLE_WIDTH / 2
        + OWNERSHIP_FLAG_CLOTH_WIDTH;
      const dividerGap = sidePanel.flowSign
        * (sidePanel.dividerLocalZ - placement.position[2]);

      expect(leftEdge).toBeGreaterThan(-sidePanel.surfaceSize[0] / 2);
      expect(rightEdge).toBeLessThan(sidePanel.surfaceSize[0] / 2);
      expect(placement.position[1]).toBeGreaterThan(TILE_SURFACE_Y);
      expect(sidePanel.flowSign
        * (placement.position[2] - sidePanel.upperOuterBoundaryLocalZ)).toBeGreaterThan(0);
      expect(dividerGap).toBeGreaterThan(OWNERSHIP_FLAG_CLOTH_DEPTH);
    });
  });
});
