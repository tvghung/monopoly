import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import Slider from './Slider';

afterEach(cleanup);

describe('Slider', () => {
  it('keeps the native range semantics with a label, bounds and value text', () => {
    render(
      <Slider
        label="Âm lượng"
        value={0.7}
        min={0}
        max={1}
        step={0.05}
        onChange={() => {}}
        formatValue={value => `${Math.round(value * 100)}%`}
      />,
    );

    const slider = screen.getByRole('slider', { name: 'Âm lượng' });
    expect(slider.getAttribute('min')).toBe('0');
    expect(slider.getAttribute('max')).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toBe('70%');
    expect(screen.getByText('70%').tagName).toBe('OUTPUT');
  });

  it('reports numeric values and defaults the readout to the raw number', () => {
    const onChange = vi.fn();
    render(<Slider label="Độ sáng" value={3} min={0} max={10} onChange={onChange} />);

    expect(screen.getByText('3').tagName).toBe('OUTPUT');
    fireEvent.change(screen.getByRole('slider', { name: 'Độ sáng' }), { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('can be disabled', () => {
    render(<Slider label="Nhạc" value={1} min={0} max={2} onChange={() => {}} disabled />);

    expect(screen.getByRole('slider', { name: 'Nhạc' })).toHaveProperty('disabled', true);
  });
});

describe('Slider announcement', () => {
  it('keeps the readout visual only: the input already announces the value through aria-valuetext', () => {
    const { container } = render(<Slider label="Nhạc nền" value={0.7} min={0} max={1} step={0.05} onChange={() => undefined} formatValue={value => `${Math.round(value * 100)}%`} />);
    const output = container.querySelector('output') as HTMLOutputElement;
    expect(output.textContent).toBe('70%');
    expect(output.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('slider', { name: 'Nhạc nền' }).getAttribute('aria-valuetext')).toBe('70%');
  });
});
