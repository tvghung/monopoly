import { createContext, useContext } from 'react';

/**
 * How the houses of the board are drawn (plan 05 §7.7). `instanced` is the tube-house layer of the whole board; `legacy` is
 * today's per-tile house boxes, switched on only when the instanced layer fails, so a kit problem never costs the board.
 */
export type HouseRenderMode = 'instanced' | 'legacy';

export const houseRenderModeContext = createContext<HouseRenderMode>('instanced');

export function useHouseRenderMode(): HouseRenderMode {
  return useContext(houseRenderModeContext);
}
