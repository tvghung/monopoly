import type { PlayerStationRenderModel } from '../board/boardRenderModel';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import { COIN_DISABLED, COIN_GOLD } from './coinVisuals';
import {
  BANK_TRAY_BASE_Y,
  BANK_TRAY_SCALE,
  BANK_WORLD_ANCHOR,
  getStationRotationY,
  getStationWorldPoint,
  type WorldAnchor,
} from './stationWorld';

export interface TrayInstance {
  key: string;
  kind: 'station' | 'bank';
  /** World position of the tray footprint center at its base. */
  position: WorldAnchor;
  rotationY: number;
  /** Uniform scale relative to the station tray. */
  scale: number;
  /** CSS color of the rim (player color, gold for the bank, gray for players who are out). */
  rimColor: string;
}

/** Trays under every present station plus the bank treasury, in a stable order. */
export function buildTrayInstances(stations: readonly PlayerStationRenderModel[]): TrayInstance[] {
  const stationTrays = stations.map((station): TrayInstance => ({
    key: `station:${station.playerId}`,
    kind: 'station',
    position: getStationWorldPoint(station.slot, 0, 0, 0),
    rotationY: getStationRotationY(station.slot),
    scale: 1,
    rimColor: station.status === 'ACTIVE' ? getPlayerDisplayColor(station.color) : `#${COIN_DISABLED.getHexString()}`,
  }));
  return [
    ...stationTrays,
    {
      key: 'bank',
      kind: 'bank',
      position: [BANK_WORLD_ANCHOR[0], BANK_TRAY_BASE_Y, BANK_WORLD_ANCHOR[2]],
      rotationY: 0,
      scale: BANK_TRAY_SCALE,
      rimColor: `#${COIN_GOLD.getHexString()}`,
    },
  ];
}

/** Changes only when a tray appears, moves or changes color: balances do not touch it. */
export function trayInstancesSignature(instances: readonly TrayInstance[]): string {
  return instances.map(instance => `${instance.key}|${instance.rimColor}|${instance.position.join(',')}`).join(';');
}
