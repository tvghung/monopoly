import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TileOwnershipLayer from './TileOwnershipLayer';

describe('tile ownership layer', () => {
  it('does not render a physical owner strip when an owned tile has ownerColor', () => {
    const { container } = render(
      <TileOwnershipLayer ownerColor="red" size={[1.5, 2.4]} selected={false} />,
    );

    expect(container.querySelector('group[name="TileOwnershipLayer"]')).not.toBeNull();
    expect(container.querySelector('[name="OwnerTab"]')).toBeNull();
  });

  it('preserves selected-tile feedback independently from ownership', () => {
    const { container } = render(
      <TileOwnershipLayer ownerColor="blue" size={[1.5, 2.4]} selected />,
    );

    expect(container.querySelector('group[name="TileOwnershipLayer"] > group')).not.toBeNull();
    expect(container.querySelector('[name="OwnerTab"]')).toBeNull();
  });
});
