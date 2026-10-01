import { useId, type ChangeEvent, type ReactNode } from 'react';
import './Switch.css';

export interface SwitchProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: ReactNode;
  /** Id of an element elsewhere on the page that also describes the switch (appended to aria-describedby). */
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}

/** On/off setting. A native checkbox with `role="switch"` keeps Space toggling and form semantics. */
export default function Switch({
  label,
  checked,
  onChange,
  description,
  describedBy,
  disabled = false,
  className = '',
}: SwitchProps) {
  const descriptionId = useId();
  return (
    <label className={`ds-switch${disabled ? ' ds-switch--disabled' : ''}${className ? ` ${className}` : ''}`}>
      <input
        className="ds-switch__input"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={[description ? descriptionId : null, describedBy].filter(Boolean).join(' ') || undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
      />
      <span className="ds-switch__track" aria-hidden="true"><span className="ds-switch__thumb" /></span>
      <span className="ds-switch__text">
        <span className="ds-switch__label">{label}</span>
        {description ? <span id={descriptionId} className="ds-switch__description">{description}</span> : null}
      </span>
    </label>
  );
}
