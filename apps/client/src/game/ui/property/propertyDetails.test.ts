import { describe, expect, it } from 'vitest';
import { tileState } from '@monopoly/shared';
import { getTileDetails } from './propertyDetails';

describe('property inspection details', () => {
  it('keeps canonical normal-property rent and hotel details', () => {
    const details = getTileDetails(tileState[1]);
    expect(details).toContainEqual({ label: 'Có Khách Sạn', value: '250.000 ₫' });
    expect(details).toContainEqual({ label: 'Giá mỗi Nhà / Khách Sạn', value: '50.000 ₫' });
  });

  it('describes special spaces without adding gameplay actions', () => {
    expect(getTileDetails(tileState[7])[0].label).toContain('Cơ Hội');
    expect(getTileDetails(tileState[10])[0].label).toContain('thăm tù');
  });
});
