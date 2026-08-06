// Format an in-game amount with thousands separators, e.g. 1500 -> "$1,500M".
export const formatMoney = (amount: number): string => `$${amount.toLocaleString('en-US')}M`;
