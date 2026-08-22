import {
  useLayoutEffect, useMemo, useRef,
} from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerStationRenderModel } from '../board/boardRenderModel';
import type { MoneyTransferSignal } from '../../presentation/store/types';
import { formatMoney } from '../../ui/formatters';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import SdfBillboardText from '../board/tiles/SdfBillboardText';
import {
  COIN_FINISH_MATERIALS,
  COIN_FINISH_ORDER,
  coinFinishForIndex,
  COIN_DISABLED,
  COIN_THICKNESS,
  SHARED_COIN_GEOMETRY,
  stableCoinSeed,
  type CoinFinish,
} from './coinVisuals';
import {
  BANK_WORLD_ANCHOR,
  getStationWorldPoint,
  resolveStationTransferAmount,
} from './stationWorld';

export function wealthCoinCount(balance: number): number {
  if (balance <= 0) return 0;
  if (balance < 200) return 4;
  if (balance < 500) return 5;
  if (balance < 1_000) return 6;
  if (balance < 1_500) return 7;
  if (balance < 2_000) return 8;
  if (balance < 3_000) return 10;
  return 12;
}

interface CoinInstance {
  position: readonly [number, number, number];
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
      object.rotation.set(0, (index % 3) * 0.035, 0);
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
    />
  );
}

function CoinPiles({ stations }: { stations: readonly PlayerStationRenderModel[] }) {
  const instances = useMemo((): CoinInstance[] => {
    const bankCoins = Array.from({ length: 15 }, (_, index): CoinInstance => {
      const column = index % 5;
      const layer = Math.floor(index / 5);
      return {
        position: [
          BANK_WORLD_ANCHOR[0] + (column - 2) * 0.22,
          0.36 + layer * (COIN_THICKNESS + 0.008),
          BANK_WORLD_ANCHOR[2] + 0.08 + (index % 2) * 0.08,
        ],
        finish: coinFinishForIndex(index, stableCoinSeed('bank')),
        disabled: false,
      };
    });
    const stationCoins = stations.flatMap(station => {
      const count = station.status === 'ACTIVE' ? wealthCoinCount(station.accountBalance) : 3;
      return Array.from({ length: count }, (_, index): CoinInstance => {
        const column = index % 4;
        const layer = Math.floor(index / 4);
        return {
          position: getStationWorldPoint(
            station.slot,
            0.88 + (column - 1.5) * 0.18,
            (index % 2) * 0.075 - 0.04,
            0.43 + layer * (COIN_THICKNESS + 0.008),
          ),
          finish: coinFinishForIndex(index, stableCoinSeed(station.playerId)),
          disabled: station.status !== 'ACTIVE',
        };
      });
    });
    return [...bankCoins, ...stationCoins];
  }, [stations]);

  return (
    <group name="SharedStationAndBankCoins" userData={{ bankCoinCount: 15, symbolicWealth: true }}>
      {COIN_FINISH_ORDER.map(finish => <CoinFinishPile key={finish} finish={finish} instances={instances} />)}
    </group>
  );
}

function stationStatusLabel(station: PlayerStationRenderModel): string {
  if (station.status === 'BANKRUPT') return 'PHÁ SẢN';
  if (station.status === 'LEFT') return 'ĐÃ RỜI';
  if (!station.isConnected) return 'MẤT KẾT NỐI';
  return '';
}

function StationInformation({ station }: { station: PlayerStationRenderModel }) {
  const disabled = station.status !== 'ACTIVE';
  const status = stationStatusLabel(station);
  const primary = disabled ? '#d5dbd7' : '#f7f1d8';
  return (
    <>
      <SdfBillboardText
        value={`${station.name}${status ? ` · ${status}` : ''}`}
        position={getStationWorldPoint(station.slot, -0.1, 0, 0.92)}
        fontSize={status ? 0.16 : 0.2}
        maxWidth={2.35}
        color={primary}
        name={`PlayerStationName:${station.playerId}`}
      />
      <SdfBillboardText
        value={formatMoney(station.accountBalance)}
        position={getStationWorldPoint(station.slot, -0.1, 0, 0.62)}
        fontSize={0.29}
        maxWidth={1.9}
        color={primary}
        name={`PlayerStationBalance:${station.playerId}`}
      />
    </>
  );
}

function BankTreasury() {
  return (
    <group name="BankTreasury" userData={{ sourceSink: true, footprint: [2.15, 1.02] }}>
      <RoundedBoxMesh
        width={2.15}
        height={0.3}
        depth={1.02}
        radius={0.12}
        segments={2}
        color="#365247"
        materialProfile="boardBody"
        position={[BANK_WORLD_ANCHOR[0], 0.15, BANK_WORLD_ANCHOR[2]]}
        name="BankTreasuryBase"
      />
    </group>
  );
}

function StationMoneyAmounts({
  stations,
  moneyTransfers,
}: {
  stations: readonly PlayerStationRenderModel[];
  moneyTransfers: readonly MoneyTransferSignal[];
}) {
  const signal = moneyTransfers.at(-1);
  if (!signal) return null;
  return (
    <>
      {stations.flatMap(station => {
        const amount = resolveStationTransferAmount(station.playerId, signal);
        if (amount === null) return [];
        const positive = amount > 0;
        return [(
          <SdfBillboardText
            key={`${signal.id}:${station.playerId}`}
            value={`${positive ? '+' : '-'}${formatMoney(Math.abs(amount))}`}
            position={getStationWorldPoint(station.slot, 0, 0, 1.3)}
            fontSize={0.25}
            maxWidth={1.8}
            color={positive ? '#bdf58d' : '#ffd0bb'}
            name={`PlayerStationAmount:${station.playerId}`}
          />
        )];
      })}
    </>
  );
}

export default function PlayerStationLayer({
  stations,
  moneyTransfers,
}: {
  stations: readonly PlayerStationRenderModel[];
  moneyTransfers: readonly MoneyTransferSignal[];
}) {
  return (
    <group name="PlayerStationLayer">
      <BankTreasury />
      <CoinPiles stations={stations} />
      {stations.map(station => <StationInformation key={station.playerId} station={station} />)}
      <StationMoneyAmounts stations={stations} moneyTransfers={moneyTransfers} />
    </group>
  );
}
