import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import './SegmentedControl.css';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string | number> {
  /** Accessible name of the group. */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Radio group rendered as segments: arrow keys move and select, Home/End jump, one tab stop. */
export default function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const enabledIndexes = options.flatMap((option, index) => (option.disabled ? [] : [index]));
  const selectedIndex = options.findIndex(option => option.value === value);
  const tabStopIndex = selectedIndex !== -1 && !options[selectedIndex].disabled
    ? selectedIndex
    : (enabledIndexes[0] ?? -1);

  const select = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    buttons.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (enabledIndexes.length === 0) return;
    const position = enabledIndexes.indexOf(tabStopIndex);
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = enabledIndexes[(position + 1) % enabledIndexes.length];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = enabledIndexes[(position - 1 + enabledIndexes.length) % enabledIndexes.length];
    } else if (event.key === 'Home') {
      next = enabledIndexes[0];
    } else if (event.key === 'End') {
      next = enabledIndexes[enabledIndexes.length - 1];
    }
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`ds-segmented${className ? ` ${className}` : ''}`}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const checked = index === selectedIndex;
        return (
          <button
            key={String(option.value)}
            ref={element => { buttons.current[index] = element; }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={option.disabled}
            tabIndex={index === tabStopIndex ? 0 : -1}
            className={`ds-segmented__option${checked ? ' ds-segmented__option--selected' : ''}`}
            onClick={() => select(index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
