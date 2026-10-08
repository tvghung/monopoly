import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { boardViewStore } from '../../scene/camera/boardView';
import CameraControls from './CameraControls';

afterEach(() => {
  cleanup();
  boardViewStore.resetForTests();
});

const frame = { halfWidth: 12, halfHeight: 6 };

describe('CameraControls', () => {
  it('draws nothing without a 3D board (the flat fallback board has no camera)', () => {
    const { container } = render(<CameraControls />);
    expect(container.firstChild).toBeNull();
  });

  it('zooms in and out in steps, disables the ends and offers the reset only away from the overview', () => {
    boardViewStore.setFrame(frame, 0.02, true);
    act(() => { boardViewStore.attach(); });
    render(<CameraControls />);

    const zoomIn = screen.getByRole('button', { name: 'Phóng to bàn cờ' });
    const zoomOut = screen.getByRole<HTMLButtonElement>('button', { name: 'Thu nhỏ bàn cờ' });
    expect(zoomOut.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Về góc nhìn toàn bàn' })).toBeNull();

    fireEvent.click(zoomIn);
    expect(boardViewStore.getView().zoom).toBeCloseTo(1.5);
    expect(zoomOut.disabled).toBe(false);
    for (let i = 0; i < 6; i += 1) fireEvent.click(zoomIn);
    expect(boardViewStore.getView().zoom).toBe(3.5);
    expect((zoomIn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Về góc nhìn toàn bàn' }));
    expect(boardViewStore.isDefault()).toBe(true);
    expect(screen.queryByRole('button', { name: 'Về góc nhìn toàn bàn' })).toBeNull();
  });

  it('keeps touch targets at 44 px (the shared icon button) and sends nothing to the game', () => {
    boardViewStore.setFrame(frame, 0.02, true);
    act(() => { boardViewStore.attach(); });
    const { container } = render(<CameraControls />);
    for (const button of container.querySelectorAll('button')) {
      expect(button.className).toContain('ds-icon-button');
    }
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Góc nhìn bàn cờ');
  });
});
