import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CenterAirport, {
  CENTER_DECORATION_MESH_COUNT,
  CENTER_DECORATION_THEME,
} from './CenterAirport';
import { boardVisualTokens } from '../boardVisualTokens';

describe('airport center composition', () => {
  it('keeps the field, runway and one authored path without timer or pebble clutter', () => {
    const { container } = render(<CenterAirport />);

    expect(container.querySelector('[name="AirportField"]')).not.toBeNull();
    expect(container.querySelector('[name="AirportRunwayLoop"]')).not.toBeNull();
    expect(container.querySelector('[name="AirportRunwayDashes"]')).not.toBeNull();
    expect(container.querySelector('[name="CenterOrthogonalPath"]')).not.toBeNull();
    expect(container.querySelector('[name="CenterPebbles"]')).toBeNull();
    expect(container.querySelector('[name="MatchTimerSign"]')).toBeNull();
  });

  it('stays within the lightweight Phase 2 mesh budget', () => {
    expect(CENTER_DECORATION_MESH_COUNT).toBeLessThanOrEqual(6);
    expect(CENTER_DECORATION_THEME).toBe('airport');
    // Plan 02 T02.16: jade-tinted path and a paper-toned outer accent replace the lime path and cool white.
    expect(boardVisualTokens.centerPath).toBe('#a1dbc1');
    expect(boardVisualTokens.boardOuterAccent).toBe('#f3e9da');
  });
});
