import {
  useLayoutEffect, useMemo, useRef,
} from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerStationRenderModel } from '../board/boardRenderModel';
import {
  COIN_FINISH_MATERIALS,
  COIN_FINISH_ORDER,
  coinTiltForIndex,
  coinFinishForIndex,
  COIN_DISABLED,
  COIN_THICKNESS,
  SHARED_COIN_GEOMETRY,
  stableCoinSeed,
  type CoinFinish,
} from './coinVisuals';
import PlayerTrays from './PlayerTrays';
import {
  BANK_COIN_BASE_Y,
  BANK_WORLD_ANCHOR,
  PLAYER_STATION_COIN_BASE_Y,
  getStationWorldPoint,
} from './stationWorld';

export function wealthCoinCount(balance: number): number {
  if (balance <= 0) return 0;
  return Math.min(20, 9 + Math.floor(Math.sqrt(balance / 1_500) * 11));
}

interface CoinInstance {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  finish: CoinFinish;
  disabled: boolean;
}

function CoinFinishPile({
  finish,
  instances,
}: {
  finish: CoinFinish;
  instances: readonly CoinInstance[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  const object = useMemo(() => new THREE.Object3D(), []);
  const finishInstances = instances.filter(instance => instance.finish === finish);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    finishInstances.forEach((instance, index) => {
      object.position.set(...instance.position);
      object.rotation.set(...instance.rotation);
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      mesh.setColorAt(index, instance.disabled ? COIN_DISABLED : new THREE.Color('#ffffff'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [finishInstances, finish, invalidate, object]);

  if (finishInstances.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[SHARED_COIN_GEOMETRY, COIN_FINISH_MATERIALS[finish], finishInstances.length]}
      name={`StationCoins:${finish}`}
      castShadow
    />
  );
}

function CoinPiles({ stations }: { stations: readonly PlayerStationRenderModel[] }) {
  const instances = useMemo((): CoinInstance[] => {
    const bankCoins = Array.from({ length: 18 }, (_, index): CoinInstance => {
      const column = index % 6;
      const layer = Math.floor(index / 6);
      return {
        position: [
          BANK_WORLD_ANCHOR[0] + (column - 2.5) * 0.24,
          BANK_COIN_BASE_Y + layer * (COIN_THICKNESS + 0.008),
          BANK_WORLD_ANCHOR[2] + 0.04 + (index % 2) * 0.1,
        ],
        rotation: (() => {
          const [tiltX, tiltZ] = coinTiltForIndex(
            index,
            stableCoinSeed('bank'),
            layer === 2 || column === 0,
          );
          return [tiltX, (index % 3) * 0.035, tiltZ] as const;
        })(),
        finish: coinFinishForIndex(index, stableCoinSeed('bank')),
        disabled: false,
      };
    });
    const stationCoins = stations.flatMap(station => {
      const count = station.status === 'ACTIVE' ? wealthCoinCount(station.accountBalance) : 3;
      return Array.from({ length: count }, (_, index): CoinInstance => {
        const column = index % 7;
        const layer = Math.floor(index / 7);
        return {
          position: getStationWorldPoint(
            station.slot,
            (column - 3) * 0.28,
            0.12 + (index % 2) * 0.1,
            PLAYER_STATION_COIN_BASE_Y + layer * (COIN_THICKNESS + 0.018),
          ),
          rotation: (() => {
            const [tiltX, tiltZ] = coinTiltForIndex(
              index,
              stableCoinSeed(station.playerId),
              layer === Math.floor((count - 1) / 7) || column === 0,
            );
            return [tiltX, (index % 3) * 0.035, tiltZ] as const;
          })(),
          finish: coinFinishForIndex(index, stableCoinSeed(station.playerId)),
          disabled: station.status !== 'ACTIVE',
        };
      });
    });
    return [...bankCoins, ...stationCoins];
  }, [stations]);

  return (
    <group name="SharedStationAndBankCoins" userData={{ bankCoinCount: 18, symbolicWealth: true }}>
      {COIN_FINISH_ORDER.map(finish => <CoinFinishPile key={finish} finish={finish} instances={instances} />)}
    </group>
  );
}

/**
 * The world-space part of a player seat: the lacquer tray and the coin piles. Names, balances and money changes are
 * DOM (the player cards of `GameHud`); the station stays a coin-flight anchor and a camera fit point.
 */
export default function PlayerStationLayer({ stations }: { stations: readonly PlayerStationRenderModel[] }) {
  return (
    <group name="PlayerStationLayer">
      <PlayerTrays stations={stations} />
      <CoinPiles stations={stations} />
    </group>
  );
}
