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
  return Math.min(20, 9 + Math.floor(Math.sqrt(balance / 1_500) * 11));
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
    const bankCoins = Array.from({ length: 18 }, (_, index): CoinInstance => {
      const column = index % 6;
      const layer = Math.floor(index / 6);
      return {
        position: [
          BANK_WORLD_ANCHOR[0] + (column - 2.5) * 0.24,
          0.36 + layer * (COIN_THICKNESS + 0.008),
          BANK_WORLD_ANCHOR[2] + 0.04 + (index % 2) * 0.1,
        ],
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
            0.62 + layer * (COIN_THICKNESS + 0.018),
          ),
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
        position={getStationWorldPoint(station.slot, 0, 0, 1.92)}
        fontSize={status ? 0.26 : 0.31}
        maxWidth={3.25}
        color={primary}
        outlineColor="#14231f"
        outlineWidth={status ? 0.0104 : 0.0124}
        outlineOpacity={0.72}
        name={`PlayerStationName:${station.playerId}`}
      />
      <SdfBillboardText
        value={formatMoney(station.accountBalance)}
        position={getStationWorldPoint(station.slot, 0, 0, 1.4)}
        fontSize={0.42}
        maxWidth={2.8}
        color={primary}
        outlineColor="#14231f"
        outlineWidth={0.0168}
        outlineOpacity={0.72}
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
            position={getStationWorldPoint(station.slot, 0, 0, 2.35)}
            fontSize={0.31}
            maxWidth={2.4}
            color={positive ? '#bdf58d' : '#ffd0bb'}
            outlineColor="#14231f"
            outlineWidth={0.0124}
            outlineOpacity={0.72}
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
