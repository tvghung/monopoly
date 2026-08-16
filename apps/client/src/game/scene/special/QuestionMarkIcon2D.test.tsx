import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getOrientedTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';
import CardDeckVisual from './CardDeckVisual';
import { createQuestionMarkGeometry } from './QuestionMarkIcon2D';

describe('procedural Chance question-mark icon', () => {
  it('creates separate curved hook, stem, and dot ShapeGeometry parts', () => {
    const geometries = createQuestionMarkGeometry();
    [geometries.hook, geometries.stem, geometries.dot].forEach(geometry => {
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
      geometry.computeBoundingBox();
      expect(geometry.boundingBox).not.toBeNull();
    });
    expect(geometries.hook.getAttribute('position').count)
      .not.toBe(geometries.dot.getAttribute('position').count);
    geometries.hook.dispose();
    geometries.stem.dispose();
    geometries.dot.dispose();
  });

  it('mounts Chance with vector icon nodes and no SDF glyph or chest placeholder', () => {
    const panel = getOrientedTilePanelLayoutForTileSize([1.5, 2.35], 'BOTTOM');
    const { container } = render(<CardDeckVisual panel={panel} kind="chance" />);

    expect(container.querySelector('[name="QuestionMarkIcon2D"]')).not.toBeNull();
    expect(container.querySelector('[name="QuestionMarkHook"]')).not.toBeNull();
    expect(container.querySelector('[name="QuestionMarkStem"]')).not.toBeNull();
    expect(container.querySelector('[name="QuestionMarkDot"]')).not.toBeNull();
    expect(container.querySelector('[name="ChanceQuestionMark"]')).toBeNull();
    expect(container.querySelector('[name="TreasureChestGraphic"]')).toBeNull();
  });
});
