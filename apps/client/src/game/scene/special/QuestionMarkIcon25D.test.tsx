import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getOrientedTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';
import CardDeckVisual from './CardDeckVisual';
import {
  QUESTION_MARK_EXTRUSION_DEPTH,
  createQuestionMarkGeometry,
} from './QuestionMarkIcon25D';

describe('procedural Chance question-mark icon', () => {
  it('creates one continuous extruded body and a separate extruded dot', () => {
    const geometries = createQuestionMarkGeometry();
    [geometries.main, geometries.dot].forEach(geometry => {
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
      geometry.computeBoundingBox();
      expect(geometry.boundingBox).not.toBeNull();
      expect(geometry.parameters.options.depth).toBeGreaterThan(0);
    });
    expect(geometries.main.parameters.options.depth).toBe(QUESTION_MARK_EXTRUSION_DEPTH);
    geometries.main.dispose();
    geometries.dot.dispose();
  });

  it('mounts Chance with one continuous body and no old hook/stem split', () => {
    const panel = getOrientedTilePanelLayoutForTileSize([1.5, 2.35], 'BOTTOM');
    const { container } = render(<CardDeckVisual panel={panel} kind="chance" />);

    expect(container.querySelector('[name="QuestionMarkIcon25D"]')).not.toBeNull();
    expect(container.querySelector('[name="QuestionMarkBody"]')).not.toBeNull();
    expect(container.querySelector('[name="QuestionMarkDot"]')).not.toBeNull();
    expect(container.querySelector('[name="QuestionMarkHook"]')).toBeNull();
    expect(container.querySelector('[name="QuestionMarkStem"]')).toBeNull();
    expect(container.querySelector('[name="ChanceQuestionMark"]')).toBeNull();
    expect(container.querySelector('[name="TreasureChestGraphic"]')).toBeNull();
  });
});
