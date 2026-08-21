import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiceRenderModel } from '../../game/scene/board/boardRenderModel';
import LegacyDiceOverlay from './LegacyDiceOverlay';

afterEach(cleanup);

const settledModel: DiceRenderModel = {
  dice: { dice1: 2, dice2: 5 },
  rollSequence: 4,
  phase: 'SETTLED',
  durationMs: 0,
};

describe('legacy dice overlay', () => {
  it('renders authoritative settled values and total', () => {
    render(<LegacyDiceOverlay model={settledModel} />);

    const overlay = screen.getByRole('complementary', { name: 'Kết quả đổ xúc xắc' });
    expect(overlay.getAttribute('data-roll-sequence')).toBe('4');
    expect(overlay.getAttribute('data-dice-phase')).toBe('SETTLED');
    expect(overlay.textContent).toContain('2');
    expect(overlay.textContent).toContain('5');
    expect(overlay.textContent).toContain('Tổng 7');
  });

  it('shows rolling state without inventing a second result or live announcement source', () => {
    render(<LegacyDiceOverlay model={{ ...settledModel, phase: 'ROLLING', durationMs: 640 }} />);

    const overlay = screen.getByRole('complementary', { name: 'Kết quả đổ xúc xắc' });
    expect(overlay.getAttribute('data-dice-phase')).toBe('ROLLING');
    expect(overlay.textContent).not.toContain('Tổng 7');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays hidden for sequence zero and reconnect baseline state', () => {
    const { container } = render(
      <LegacyDiceOverlay model={{ ...settledModel, rollSequence: 0, phase: 'HIDDEN' }} />,
    );

    expect(container.firstElementChild).toBeNull();
  });
});
