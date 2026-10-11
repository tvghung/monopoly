import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './style/LanguageSelector.css';

export interface DropdownSelectorOption<Value extends string | number> {
  value: Value;
  label: string;
  lang?: string;
}

interface DropdownSelectorProps<Value extends string | number> {
  value: Value;
  options: readonly DropdownSelectorOption<Value>[];
  onChange: (value: Value) => void;
  heading: string;
  triggerLabel: string;
  icon: ReactNode;
  disabled?: boolean;
  className?: string;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function DropdownSelector<Value extends string | number>({
  value, options, onChange, heading, triggerLabel, icon, disabled = false, className = '',
}: DropdownSelectorProps<Value>) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number; placement: 'up' | 'down' } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const titleId = useId();
  const current = options.find(option => option.value === value) ?? options[0];

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) triggerRef.current?.focus();
  };

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    const popover = popoverRef.current?.getBoundingClientRect();
    if (!trigger || !popover) return;
    const above = trigger.top - 8;
    const below = window.innerHeight - trigger.bottom - 8;
    const placement = popover.height <= below || below >= above ? 'down' : 'up';
    const available = placement === 'down' ? below : above;
    const maxHeight = Math.max(0, available);
    const height = Math.min(popover.height, maxHeight);
    const halfWidth = popover.width / 2;
    const left = Math.min(Math.max(trigger.left + trigger.width / 2, halfWidth + 8), window.innerWidth - halfWidth - 8);
    setPosition({
      left,
      top: placement === 'down' ? trigger.bottom + 8 : Math.max(8, trigger.top - height - 8),
      maxHeight,
      placement,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    popoverRef.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')?.focus();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !rootRef.current?.contains(event.target)
        && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const choose = (next: Value) => {
    close(true);
    if (next !== value) onChange(next);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!disabled && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      if (!open) setOpen(true);
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      const scope = rootRef.current?.closest<HTMLElement>('[role="dialog"]') ?? document;
      const items = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const index = items.indexOf(triggerRef.current!);
      items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      close(false);
      return;
    }
    const items = [...(popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const index = items.findIndex(item => item === document.activeElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next === -1) return;
    event.preventDefault();
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} className={`language-selector${className ? ` ${className}` : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="ds-button ds-button--ghost ds-button--md language-selector__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={triggerLabel}
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="language-selector__icon" aria-hidden="true">{icon}</span>
        <span className="language-selector__current">{current?.label}</span>
        <ChevronDown className="language-selector__chevron" aria-hidden="true" />
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={popoverRef}
            className="language-selector__popover language-selector__popover--fixed"
            data-placement={position?.placement ?? 'down'}
            style={position ? {
              left: position.left,
              top: position.top,
              maxHeight: position.maxHeight,
            } : undefined}
            onKeyDown={onListKeyDown}
          >
            <p id={titleId} className="language-selector__title">{heading}</p>
            <div id={listId} className="language-selector__list" role="listbox" aria-labelledby={titleId}>
              {options.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  lang={option.lang}
                  aria-selected={option.value === value}
                  className="language-selector__option"
                  onClick={() => choose(option.value)}
                >
                  <span className="language-selector__check" aria-hidden="true">{option.value === value ? <Check /> : null}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
