import type { CSSProperties, PointerEvent } from 'react';
import type { PowerUpCategory, PowerUpDefinition } from '@monopoly/shared';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import PowerUpCard from './PowerUpCard';

type PickerStyle = CSSProperties & Record<`--${string}`, string | number>;
const particles: PickerStyle[] = Array.from({ length: 18 }, (_, index) => {
  const angle = index * Math.PI * 2 / 18;
  return {
    '--particle-x': `${Math.cos(angle) * (94 + index % 3 * 12)}px`,
    '--particle-y': `${Math.sin(angle) * (116 + index % 4 * 12)}px`,
    '--particle-turn': `${index % 2 ? 150 : -130}deg`,
    '--particle-delay': `${index % 3 * 18}ms`,
  };
});

/** Presentation around the existing flat face; inventory and gameplay panels do not use this shell. */
export default function PowerUpPickerCard({ category, definition, selected, discarded, disabled, animateReveal, position, burst, onChoose }: {
  category: PowerUpCategory; definition?: PowerUpDefinition; selected: boolean; discarded: boolean;
  disabled: boolean; animateReveal: boolean; position: number; burst: boolean; onChoose?: () => void;
}) {
  const reducedMotion = useEffectiveReducedMotion();
  const interactive = !disabled && Boolean(onChoose);
  const hoverable = interactive || Boolean(definition);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || !hoverable || event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    event.currentTarget.style.setProperty('--picker-rotate-x', `${-y * 7}deg`);
    event.currentTarget.style.setProperty('--picker-rotate-y', `${x * 7}deg`);
  };
  const reset = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.removeProperty('--picker-rotate-x');
    event.currentTarget.style.removeProperty('--picker-rotate-y');
  };
  return <div className="power-up-picker-card" data-category={category} data-selected={selected}
    data-discarded={discarded} data-interactive={interactive} data-hoverable={hoverable} data-reduced-motion={reducedMotion}
    style={{ '--picker-duration': `${4.4 + position * .6}s`, '--picker-phase': `${position * -1.6}s` } as PickerStyle}
    onPointerMove={move} onPointerLeave={reset}>
    <div className="power-up-picker-float"><div className="power-up-picker-tilt">
      <PowerUpCard category={category} definition={definition} selected={selected} discarded={discarded}
        disabled={disabled} animateReveal={animateReveal} onChoose={onChoose} />
      <span className="power-up-picker-sheen" aria-hidden="true" />
      <span className="power-up-picker-sparkles" aria-hidden="true"><i /><i /><i /><i /></span>
    </div></div>
    {burst && !reducedMotion ? <span className="power-up-picker-burst" aria-hidden="true">
      {particles.map((style, index) => <i key={index} style={style} />)}
    </span> : null}
  </div>;
}
