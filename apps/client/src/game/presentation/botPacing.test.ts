import { BOT_THINKING_PAUSE_MS, estimateRollPresentationMs, ROLL_PRESENTATION_BUDGET_MS } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { presentationTiming } from './timings';

describe('bot pacing mirrors the client roll presentation (BA)', () => {
  it('keeps the shared budget equal to the normal-speed timings the client plays', () => {
    expect(ROLL_PRESENTATION_BUDGET_MS.dice).toBe(presentationTiming.diceRoll + presentationTiming.diceResultHold);
    expect(ROLL_PRESENTATION_BUDGET_MS.moveLead).toBe(presentationTiming.destinationPreviewLead);
    expect(ROLL_PRESENTATION_BUDGET_MS.perStep).toBe(presentationTiming.tileHop);
    expect(ROLL_PRESENTATION_BUDGET_MS.landing).toBe(presentationTiming.landing
      + presentationTiming.tileImpact.landDepress + presentationTiming.tileImpact.landRebound);
    expect(ROLL_PRESENTATION_BUDGET_MS.passGo).toBe(presentationTiming.goMoment);
  });

  it('leaves a visible thinking pause after the landing at normal speed', () => {
    for (const steps of [2, 7, 12]) {
      const played = presentationTiming.diceRoll + presentationTiming.diceResultHold + presentationTiming.destinationPreviewLead
        + steps * presentationTiming.tileHop + presentationTiming.landing;
      expect(estimateRollPresentationMs(steps, false) + BOT_THINKING_PAUSE_MS - played).toBeGreaterThanOrEqual(BOT_THINKING_PAUSE_MS);
    }
  });
});
