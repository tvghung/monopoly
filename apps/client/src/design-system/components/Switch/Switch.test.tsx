import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import Switch from './Switch';

afterEach(cleanup);

describe('Switch', () => {
  it('exposes role="switch" with its state and a name from the label', () => {
    render(<Switch label="Giảm chuyển động" checked={false} onChange={() => {}} />);

    const control = screen.getByRole('switch', { name: 'Giảm chuyển động' });
    expect(control).toHaveProperty('checked', false);
  });

  it('reports the new state on toggle', () => {
    const onChange = vi.fn();
    render(<Switch label="Toàn màn hình" checked={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Toàn màn hình' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('describes itself and respects the disabled state', () => {
    render(
      <Switch
        label="Âm thanh"
        description="Bật hoặc tắt tiếng."
        checked
        disabled
        onChange={() => {}}
      />,
    );

    const control = screen.getByRole('switch', { name: /Âm thanh/ });
    expect(control).toHaveProperty('disabled', true);
    expect(control).toHaveProperty('checked', true);
    expect(control.getAttribute('aria-describedby')).toBe(screen.getByText('Bật hoặc tắt tiếng.').id);
  });
});
