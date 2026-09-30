import type { MoneyEndpoint } from '@monopoly/shared';
import type { MoneyTransferSignal } from '../../presentation/store/types';
import { CENTER_AIRPORT_FIELD_TOP_Y } from '../board/architecture/boardArtSpec';
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
/**
 * Lacquer trays ground the coin piles (plan 02 §8.5). A station tray is 2.8 x 1.3 (tangent x outward, inside
 * the fitted station envelope) and 0.14 high with a 0.05 colored rim; the bank tray is the same shape at
 * 0.775 scale so its footprint stays the 2.15 x 1.02 that the dice arena already avoids.
 */
export const STATION_TRAY_WIDTH = 2.8;
export const STATION_TRAY_DEPTH = 1.3;
export const STATION_TRAY_HEIGHT = 0.14;
export const STATION_TRAY_RIM_HEIGHT = 0.05;
export const STATION_TRAY_RIM_WIDTH = 0.11;
export const BANK_TRAY_SCALE = 0.775;
export const TRAY_LACQUER_COLOR = '#3a2418';
/** Coin half thickness (0.05) plus a hair of clearance, resting on the tray top. */
export const COIN_REST_CLEARANCE = 0.06;

export const PLAYER_STATION_COIN_BASE_Y = STATION_TRAY_HEIGHT + COIN_REST_CLEARANCE;
/** Coin flights end half a unit above the resting pile base. */
export const PLAYER_STATION_TRANSFER_Y = PLAYER_STATION_COIN_BASE_Y + 0.5;

export const BANK_WORLD_ANCHOR: WorldAnchor = [0.55, 0, 3.18];
/** The treasury tray rests on the center field, not under it. */
export const BANK_TRAY_BASE_Y = CENTER_AIRPORT_FIELD_TOP_Y;
export const BANK_COIN_BASE_Y = BANK_TRAY_BASE_Y + STATION_TRAY_HEIGHT * BANK_TRAY_SCALE + COIN_REST_CLEARANCE;
export const BANK_TRANSFER_Y = BANK_COIN_BASE_Y + 0.62;

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
