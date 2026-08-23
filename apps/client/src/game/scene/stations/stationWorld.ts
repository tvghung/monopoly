import type { MoneyEndpoint } from '@monopoly/shared';
import type { MoneyTransferSignal } from '../../presentation/store/types';
import { OUTER_BOARD_SIZE } from '../board/boardLayout';
import type { PlayerStationSlot } from '../../ui/stations/stationSlots';

export type WorldAnchor = readonly [number, number, number];

export const PLAYER_STATION_WIDTH = 3.6;
export const PLAYER_STATION_DEPTH = 1.65;
export const PLAYER_STATION_MAX_Y = 2.55;
export const PLAYER_STATION_CENTER_OFFSET = OUTER_BOARD_SIZE / 2 + 2.25;
export const PLAYER_STATION_BOARD_GAP = PLAYER_STATION_CENTER_OFFSET
  - OUTER_BOARD_SIZE / 2
  - PLAYER_STATION_DEPTH / 2;
export const PLAYER_STATION_TRANSFER_Y = 1.12;

export const BANK_WORLD_ANCHOR: WorldAnchor = [0.55, 0, 3.18];
export const BANK_TRANSFER_Y = 0.98;

export const PLAYER_STATION_WORLD_ANCHORS: Record<PlayerStationSlot, WorldAnchor> = {
  BOTTOM: [0, 0, PLAYER_STATION_CENTER_OFFSET],
  TOP: [0, 0, -PLAYER_STATION_CENTER_OFFSET],
  LEFT: [-PLAYER_STATION_CENTER_OFFSET, 0, 0],
  RIGHT: [PLAYER_STATION_CENTER_OFFSET, 0, 0],
};

const STATION_TANGENT: Record<PlayerStationSlot, readonly [number, number]> = {
  BOTTOM: [1, 0],
  TOP: [1, 0],
  LEFT: [0, 1],
  RIGHT: [0, 1],
};

const STATION_OUTWARD: Record<PlayerStationSlot, readonly [number, number]> = {
  BOTTOM: [0, 1],
  TOP: [0, -1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
};

export function getStationRotationY(slot: PlayerStationSlot): number {
  return slot === 'LEFT' || slot === 'RIGHT' ? Math.PI / 2 : 0;
}

export function getStationWorldPoint(
  slot: PlayerStationSlot,
  tangentOffset: number,
  outwardOffset: number,
  y: number,
): WorldAnchor {
  const anchor = PLAYER_STATION_WORLD_ANCHORS[slot];
  const tangent = STATION_TANGENT[slot];
  const outward = STATION_OUTWARD[slot];
  return [
    anchor[0] + tangent[0] * tangentOffset + outward[0] * outwardOffset,
    y,
    anchor[2] + tangent[1] * tangentOffset + outward[1] * outwardOffset,
  ];
}

export const PLAYER_STATION_SCENE_POINTS: readonly WorldAnchor[] = (
  (Object.keys(PLAYER_STATION_WORLD_ANCHORS) as PlayerStationSlot[]).flatMap(slot => (
    [0, PLAYER_STATION_MAX_Y].flatMap(y => (
      [-PLAYER_STATION_WIDTH / 2, PLAYER_STATION_WIDTH / 2].flatMap(tangent => (
        [-PLAYER_STATION_DEPTH / 2, PLAYER_STATION_DEPTH / 2].map(outward => (
          getStationWorldPoint(slot, tangent, outward, y)
        ))
      ))
    ))
  ))
);

export function resolveMoneyEndpointAnchor(
  endpoint: MoneyEndpoint,
  playerAnchors: ReadonlyMap<string, WorldAnchor>,
): WorldAnchor | null {
  if (endpoint.kind === 'BANK') {
    return [BANK_WORLD_ANCHOR[0], BANK_TRANSFER_Y, BANK_WORLD_ANCHOR[2]];
  }
  const anchor = playerAnchors.get(endpoint.playerId);
  return anchor ? [anchor[0], PLAYER_STATION_TRANSFER_Y, anchor[2]] : null;
}

export function resolveStationTransferAmount(
  playerId: string,
  transfer: MoneyTransferSignal,
): number | null {
  const outgoing = transfer.source.kind === 'PLAYER' && transfer.source.playerId === playerId;
  const incoming = transfer.destination.kind === 'PLAYER' && transfer.destination.playerId === playerId;
  if (outgoing === incoming) return null;
  return incoming ? transfer.amount : -transfer.amount;
}
