import { useId, type ChangeEvent } from 'react';
import './Slider.css';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Text shown in the value readout; defaults to the raw number. */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/** Styled native range input: keeps keyboard and assistive-technology behavior, adds a readout. */
export default function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue = String,
  disabled = false,
  className = '',
}: SliderProps) {
  const inputId = useId();
  const readout = formatValue(value);
  return (
    <div className={`ds-slider${className ? ` ${className}` : ''}`}>
      <label className="ds-slider__label" htmlFor={inputId}>{label}</label>
      <output className="ds-slider__value" htmlFor={inputId}>{readout}</output>
      <input
        id={inputId}
        className="ds-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={readout}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
