export const GAME_UNIT_IN_VND = 1_000;

const vndInteger = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
  useGrouping: true,
});

/** Format integer game units using the product convention 1 unit = 1.000 VND. */
export const formatMoney = (gameUnits: number): string => (
  `${vndInteger.format(gameUnits * GAME_UNIT_IN_VND)} ₫`
);
