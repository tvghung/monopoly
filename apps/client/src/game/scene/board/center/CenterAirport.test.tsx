import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CenterAirport from './CenterAirport';

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
});
