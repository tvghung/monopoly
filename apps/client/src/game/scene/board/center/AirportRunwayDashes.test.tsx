import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { boardVisualTokens } from '../boardVisualTokens';
import AirportRunwayDashes, { AIRPORT_RUNWAY_DASH_SPECS } from './AirportRunwayDashes';

describe('airport runway dash renderer', () => {
  it('uses one instanced white dash mesh for all four sides', () => {
    const { container } = render(<AirportRunwayDashes />);
    const instance = container.querySelector('instancedMesh[name="AirportRunwayDashes"]');
    expect(instance).not.toBeNull();
    expect(AIRPORT_RUNWAY_DASH_SPECS.length).toBeGreaterThan(0);
    expect(new Set(AIRPORT_RUNWAY_DASH_SPECS.map(spec => spec.side)).size).toBe(4);
    expect(boardVisualTokens.airportMarking).toBe('#ffffff');
    expect(container.querySelector('line')).toBeNull();
  });
});
