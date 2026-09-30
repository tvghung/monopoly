import { describe, expect, it } from 'vitest';
import { tileState } from '@monopoly/shared';
import { getCurrentRentDetailIndex, getTileDetails } from './propertyDetails';

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

describe('current rent row', () => {
  const street = tileState[1];
  const streetDetails = getTileDetails(street);

  it('follows the development level of a street and never leaves the ladder', () => {
    expect(getCurrentRentDetailIndex(street, streetDetails, { houses: 0, sameTypeOwned: 1 })).toBe(0);
    expect(getCurrentRentDetailIndex(street, streetDetails, { houses: 3, sameTypeOwned: 1 })).toBe(3);
    expect(getCurrentRentDetailIndex(street, streetDetails, { houses: 5, sameTypeOwned: 1 })).toBe(5);
    expect(getCurrentRentDetailIndex(street, streetDetails, { houses: 99, sameTypeOwned: 1 })).toBe(streetDetails.length - 1);
  });

  it('follows the owned count of railroads and utilities', () => {
    const railroad = tileState[5];
    const railroadDetails = getTileDetails(railroad);
    expect(getCurrentRentDetailIndex(railroad, railroadDetails, { houses: 0, sameTypeOwned: 1 })).toBe(0);
    expect(getCurrentRentDetailIndex(railroad, railroadDetails, { houses: 0, sameTypeOwned: 4 })).toBe(3);
    expect(getCurrentRentDetailIndex(railroad, railroadDetails, { houses: 0, sameTypeOwned: 9 })).toBe(3);
    const company = tileState[12];
    expect(getCurrentRentDetailIndex(company, getTileDetails(company), { houses: 0, sameTypeOwned: 2 })).toBe(1);
  });

  it('has no row for tiles without a rent ladder', () => {
    expect(getCurrentRentDetailIndex(tileState[0], getTileDetails(tileState[0]), { houses: 0, sameTypeOwned: 1 })).toBeNull();
    expect(getCurrentRentDetailIndex(street, [], { houses: 0, sameTypeOwned: 1 })).toBeNull();
  });
});

describe('tax tiles', () => {
  it('print the amount from shared tile data', () => {
    expect(getTileDetails(tileState[4])).toEqual([{ label: 'Nộp 200.000 ₫ cho Ngân hàng khi dừng tại đây.' }]);
    expect(getTileDetails(tileState[38])[0].label).toMatch(/^Nộp .* cho Ngân hàng/u);
  });
});
