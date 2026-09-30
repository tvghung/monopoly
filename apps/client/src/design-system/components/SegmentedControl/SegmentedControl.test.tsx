import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { useState } from 'react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import SegmentedControl from './SegmentedControl';

afterEach(cleanup);

const SPEEDS = [
  { value: 0.75, label: '0,75×' },
  { value: 1, label: '1×' },
  { value: 1.5, label: '1,5×' },
  { value: 2, label: '2×' },
] as const;

function Harness({ onChange = () => {} }: { onChange?: (value: number) => void }) {
  const [value, setValue] = useState<number>(1);
  return (
    <SegmentedControl
      label="Tốc độ hoạt ảnh"
      options={SPEEDS}
      value={value}
      onChange={next => { setValue(next); onChange(next); }}
    />
  );
}

describe('SegmentedControl', () => {
  it('is a labelled radiogroup with one checked radio and one tab stop', () => {
    render(<Harness />);

    expect(screen.getByRole('radiogroup', { name: 'Tốc độ hoạt ảnh' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(radios.map(radio => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false']);
    expect(radios.map(radio => radio.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
  });

  it('selects on click', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: '2×' }));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(screen.getByRole('radio', { name: '2×' }).getAttribute('aria-checked')).toBe('true');
  });

  it('moves and selects with the arrow keys, wraps around and supports Home/End', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const group = screen.getByRole('radiogroup');

    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(1.5);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '1,5×' }));

    fireEvent.keyDown(group, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(0.75);
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(group, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(0.75);
  });

  it('skips disabled options', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Chế độ"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
          { value: 'c', label: 'C' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('c');
    fireEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
