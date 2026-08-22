import type { MoneyEndpoint } from '@monopoly/shared';
import type { PlayerStationSlot } from '../../ui/stations/stationSlots';

export type WorldAnchor = readonly [number, number, number];

export const BANK_WORLD_ANCHOR: WorldAnchor = [0, 0.39, 3.15];

export const PLAYER_STATION_WORLD_ANCHORS: Record<PlayerStationSlot, WorldAnchor> = {
  BOTTOM: [5.75, 0.39, 5.75],
  TOP: [-5.75, 0.39, -5.75],
  LEFT: [-5.75, 0.39, 5.75],
  RIGHT: [5.75, 0.39, -5.75],
};

export function resolveMoneyEndpointAnchor(
  endpoint: MoneyEndpoint,
  playerAnchors: ReadonlyMap<string, WorldAnchor>,
): WorldAnchor | null {
  return endpoint.kind === 'BANK' ? BANK_WORLD_ANCHOR : playerAnchors.get(endpoint.playerId) ?? null;
}
