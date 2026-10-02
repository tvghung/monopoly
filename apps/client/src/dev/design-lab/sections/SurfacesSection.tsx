import { useState } from 'react';
import { LabSection, readSurfaceParams } from '../labKit';
import { SURFACES, findSurface } from '../surfaces/surfaceRegistry';

/**
 * Plan 04 §9: the real pre-game screens, dialogs and decision surfaces on fixture state. With `&surface=<id>` the one
 * surface renders alone (the capture tool uses this with `&chrome=hidden`); without it the section is an index.
 */
export default function SurfacesSection() {
  const [{ surface }] = useState(() => readSurfaceParams(window.location.search));
  const fixture = findSurface(surface);
  if (fixture) {
    return (
      <div className="lab-surface" data-lab-section="surfaces" data-surface={fixture.id}>
        {fixture.render()}
      </div>
    );
  }
  const params = new URLSearchParams(window.location.search);
  const href = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('section', 'surfaces');
    next.set('surface', id);
    return `?${next.toString()}`;
  };
  return (
    <LabSection
      id="surfaces"
      title="Surfaces: real components on fixture state"
      note="Open one to see it alone; add &chrome=hidden to hide this bar (used by the capture tool)."
    >
      <ul className="lab-surfaces-index">
        {SURFACES.map(item => (
          <li key={item.id}>
            <a href={href(item.id)}>{item.label}</a>
            {' '}
            <small>
              {item.group}
              {' · '}
              {item.id}
            </small>
          </li>
        ))}
      </ul>
    </LabSection>
  );
}
