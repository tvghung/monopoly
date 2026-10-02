import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CENTER_AIRPORT_FIELD_TOP_Y } from '../board/architecture/boardArtSpec';
import type { PlayerStationRenderModel } from '../board/boardRenderModel';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import { COIN_THICKNESS } from './coinVisuals';
import { createTrayBodyGeometry, createTrayRimGeometry } from './trayGeometry';
import { buildTrayInstances, trayInstancesSignature } from './trayLayout';
import {
  BANK_COIN_BASE_Y,
  BANK_TRAY_BASE_Y,
  BANK_TRAY_SCALE,
  BANK_TRANSFER_Y,
  BANK_WORLD_ANCHOR,
  PLAYER_STATION_COIN_BASE_Y,
  PLAYER_STATION_DEPTH,
  PLAYER_STATION_TRANSFER_Y,
  PLAYER_STATION_WIDTH,
  PLAYER_STATION_WORLD_ANCHORS,
  STATION_TRAY_DEPTH,
  STATION_TRAY_HEIGHT,
  STATION_TRAY_RIM_HEIGHT,
  STATION_TRAY_WIDTH,
} from './stationWorld';

const station = (overrides: Partial<PlayerStationRenderModel> = {}): PlayerStationRenderModel => ({
  playerId: 'player-a',
  name: 'An',
  slot: 'BOTTOM',
  anchor: PLAYER_STATION_WORLD_ANCHORS.BOTTOM,
  color: 'red',
  characterId: 'dog',
  accountBalance: 1_500,
  propertyCount: 0,
  houseCount: 0,
  hotelCount: 0,
  status: 'ACTIVE',
  isCurrentTurn: false,
  isConnected: true,
  ...overrides,
});

describe('tray heights and anchors', () => {
  it('rests the station coin piles on the tray top instead of floating over the table', () => {
    expect(PLAYER_STATION_COIN_BASE_Y).toBeGreaterThanOrEqual(STATION_TRAY_HEIGHT + COIN_THICKNESS / 2);
    expect(PLAYER_STATION_COIN_BASE_Y).toBeLessThan(STATION_TRAY_HEIGHT + COIN_THICKNESS);
    expect(PLAYER_STATION_TRANSFER_Y).toBeGreaterThan(PLAYER_STATION_COIN_BASE_Y);
  });

  it('puts the bank tray on the center field so its coins are visible, not buried', () => {
    expect(BANK_TRAY_BASE_Y).toBe(CENTER_AIRPORT_FIELD_TOP_Y);
    expect(BANK_COIN_BASE_Y).toBeGreaterThan(BANK_TRAY_BASE_Y + STATION_TRAY_HEIGHT * BANK_TRAY_SCALE);
    expect(BANK_COIN_BASE_Y).toBeGreaterThan(CENTER_AIRPORT_FIELD_TOP_Y + COIN_THICKNESS / 2);
    expect(BANK_TRANSFER_Y).toBeGreaterThan(BANK_COIN_BASE_Y);
  });

  it('keeps the bank footprint the dice arena already avoids and the station trays inside the fitted envelope', () => {
    expect(STATION_TRAY_WIDTH * BANK_TRAY_SCALE).toBeCloseTo(2.15, 1);
    expect(STATION_TRAY_DEPTH * BANK_TRAY_SCALE).toBeCloseTo(1.02, 1);
    expect(STATION_TRAY_WIDTH).toBeLessThanOrEqual(PLAYER_STATION_WIDTH);
    expect(STATION_TRAY_DEPTH).toBeLessThanOrEqual(PLAYER_STATION_DEPTH);
  });
});

describe('tray layout', () => {
  it('places one tray under every station, oriented like the station, plus the bank', () => {
    const instances = buildTrayInstances([
      station(),
      station({ playerId: 'player-b', slot: 'LEFT', color: 'blue' }),
      station({ playerId: 'player-c', slot: 'TOP', color: 'green' }),
      station({ playerId: 'player-d', slot: 'RIGHT', color: 'yellow' }),
    ]);

    expect(instances.map(instance => instance.key)).toEqual([
      'station:player-a', 'station:player-b', 'station:player-c', 'station:player-d', 'bank',
    ]);
    expect(instances[0].position).toEqual(PLAYER_STATION_WORLD_ANCHORS.BOTTOM);
    expect(instances[1].position).toEqual(PLAYER_STATION_WORLD_ANCHORS.LEFT);
    expect(instances[0].rotationY).toBe(0);
    expect(instances[1].rotationY).toBeCloseTo(Math.PI / 2);
    expect(instances[3].rotationY).toBeCloseTo(Math.PI / 2);
    expect(instances[4]).toMatchObject({
      kind: 'bank',
      position: [BANK_WORLD_ANCHOR[0], BANK_TRAY_BASE_Y, BANK_WORLD_ANCHOR[2]],
      scale: BANK_TRAY_SCALE,
    });
  });

  it('tints the rim with the player color while active and grays it out for players who are out', () => {
    const [active, left, bankrupt] = buildTrayInstances([
      station({ color: 'red' }),
      station({ playerId: 'player-b', status: 'LEFT', slot: 'LEFT' }),
      station({ playerId: 'player-c', status: 'BANKRUPT', slot: 'TOP' }),
    ]);

    expect(active.rimColor).toBe(getPlayerDisplayColor('red'));
    expect(left.rimColor).toBe(bankrupt.rimColor);
    expect(left.rimColor).not.toBe(active.rimColor);
  });

  it('keeps the signature stable across balance changes and changes it for seat or color changes', () => {
    const before = trayInstancesSignature(buildTrayInstances([station({ accountBalance: 1_500 })]));
    const richer = trayInstancesSignature(buildTrayInstances([station({ accountBalance: 9_000 })]));
    const moved = trayInstancesSignature(buildTrayInstances([station({ slot: 'TOP' })]));
    const recolored = trayInstancesSignature(buildTrayInstances([station({ color: 'blue' })]));

    expect(richer).toBe(before);
    expect(moved).not.toBe(before);
    expect(recolored).not.toBe(before);
  });
});

describe('tray geometry', () => {
  it('builds a body from the table up to the tray height', () => {
    const geometry = createTrayBodyGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;

    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(STATION_TRAY_HEIGHT, 5);
    expect(box.max.x - box.min.x).toBeCloseTo(STATION_TRAY_WIDTH, 5);
    expect(box.max.z - box.min.z).toBeCloseTo(STATION_TRAY_DEPTH, 5);
  });

  it('builds a hollow rim frame that sits on the body top', () => {
    const geometry = createTrayRimGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;
    const positions = geometry.getAttribute('position');

    expect(box.min.y).toBeCloseTo(STATION_TRAY_HEIGHT, 5);
    expect(box.max.y).toBeCloseTo(STATION_TRAY_HEIGHT + STATION_TRAY_RIM_HEIGHT, 5);
    expect(box.max.x - box.min.x).toBeCloseTo(STATION_TRAY_WIDTH, 3);
    expect(box.max.z - box.min.z).toBeCloseTo(STATION_TRAY_DEPTH, 3);
    // Hollow: no vertex may sit in the middle of the tray.
    for (let index = 0; index < positions.count; index += 1) {
      const insideCenter = Math.abs(positions.getX(index)) < STATION_TRAY_WIDTH / 2 - 0.2
        && Math.abs(positions.getZ(index)) < STATION_TRAY_DEPTH / 2 - 0.2;
      expect(insideCenter).toBe(false);
    }
  });
});
