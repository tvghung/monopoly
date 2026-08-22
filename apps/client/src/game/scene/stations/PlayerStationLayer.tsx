import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { useThree } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import type { PlayerStationRenderModel } from '../board/boardRenderModel';
import type { MoneyTransferSignal } from '../../presentation/store/types';
import { acquireCharacterTexture } from '../../characters/characterTextureCache';
import { getCharacterSpriteMaterialProps } from '../characters/characterSpriteMaterial';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import { formatMoney } from '../../ui/formatters';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import SdfBillboardText from '../board/tiles/SdfBillboardText';
import {
  COIN_DISABLED,
  COIN_GOLD,
  COIN_THICKNESS,
  SHARED_COIN_GEOMETRY,
  SHARED_COIN_MATERIAL,
} from './coinVisuals';
import {
  BANK_WORLD_ANCHOR,
  getStationRotationY,
  getStationWorldPoint,
  PLAYER_STATION_DEPTH,
  PLAYER_STATION_WIDTH,
  resolveStationTransferAmount,
} from './stationWorld';

const LOWER_BASE_HEIGHT = 0.28;
const UPPER_BASE_HEIGHT = 0.12;
const LOWER_BASE_GEOMETRY = new RoundedBoxGeometry(
  PLAYER_STATION_WIDTH,
  LOWER_BASE_HEIGHT,
  PLAYER_STATION_DEPTH,
  2,
  0.1,
);
const UPPER_BASE_GEOMETRY = new RoundedBoxGeometry(
  PLAYER_STATION_WIDTH - 0.14,
  UPPER_BASE_HEIGHT,
  PLAYER_STATION_DEPTH - 0.14,
  2,
  0.07,
);
const CONNECTION_GEOMETRY = new THREE.CylinderGeometry(0.065, 0.065, 0.09, 12);
const DISABLED_STATION_COLOR = new THREE.Color('#6f7976');
const DISABLED_STATION_TOP = new THREE.Color('#969d99');
const STATION_TOP_MIX = new THREE.Color('#dce8df');

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

function StationBases({ stations }: { stations: readonly PlayerStationRenderModel[] }) {
  const lowerRef = useRef<THREE.InstancedMesh>(null);
  const upperRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  const object = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const lower = lowerRef.current;
    const upper = upperRef.current;
    if (!lower || !upper) return;
    stations.forEach((station, index) => {
      const enabled = station.status === 'ACTIVE';
      const baseColor = enabled
        ? new THREE.Color(getPlayerDisplayColor(station.color))
        : DISABLED_STATION_COLOR;
      const topColor = enabled
        ? baseColor.clone().lerp(STATION_TOP_MIX, 0.28)
        : DISABLED_STATION_TOP;
      object.position.set(station.anchor[0], LOWER_BASE_HEIGHT / 2, station.anchor[2]);
      object.rotation.set(0, getStationRotationY(station.slot), 0);
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      lower.setMatrixAt(index, object.matrix);
      lower.setColorAt(index, baseColor);
      object.position.y = LOWER_BASE_HEIGHT + UPPER_BASE_HEIGHT / 2 - 0.01;
      object.updateMatrix();
      upper.setMatrixAt(index, object.matrix);
      upper.setColorAt(index, topColor);
    });
    lower.instanceMatrix.needsUpdate = true;
    upper.instanceMatrix.needsUpdate = true;
    if (lower.instanceColor) lower.instanceColor.needsUpdate = true;
    if (upper.instanceColor) upper.instanceColor.needsUpdate = true;
    invalidate();
  }, [invalidate, object, stations]);

  return (
    <>
      <instancedMesh
        ref={lowerRef}
        args={[LOWER_BASE_GEOMETRY, undefined, stations.length]}
        name="PlayerStationLowerBases"
        userData={{ physicalStations: true, count: stations.length }}
      >
        <meshStandardMaterial color="#ffffff" roughness={0.7} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={upperRef} args={[UPPER_BASE_GEOMETRY, undefined, stations.length]} name="PlayerStationUpperBases">
        <meshStandardMaterial color="#ffffff" roughness={0.58} metalness={0.02} />
      </instancedMesh>
    </>
  );
}

interface CoinInstance {
  position: readonly [number, number, number];
  color: THREE.Color;
}

function CoinPiles({ stations }: { stations: readonly PlayerStationRenderModel[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  const object = useMemo(() => new THREE.Object3D(), []);
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
        color: COIN_GOLD,
      };
    });
    const stationCoins = stations.flatMap(station => {
      const count = station.status === 'BANKRUPT' ? 3 : wealthCoinCount(station.accountBalance);
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
          color: station.status === 'ACTIVE' ? COIN_GOLD : COIN_DISABLED,
        };
      });
    });
    return [...bankCoins, ...stationCoins];
  }, [stations]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    instances.forEach((instance, index) => {
      object.position.set(...instance.position);
      object.rotation.set(0, (index % 3) * 0.035, 0);
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      mesh.setColorAt(index, instance.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [instances, invalidate, object]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[SHARED_COIN_GEOMETRY, SHARED_COIN_MATERIAL, instances.length]}
      name="SharedStationAndBankCoins"
      userData={{ bankCoinCount: 15, symbolicWealth: true }}
    />
  );
}

function ConnectionIndicators({ stations }: { stations: readonly PlayerStationRenderModel[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  const object = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    stations.forEach((station, index) => {
      const position = getStationWorldPoint(station.slot, 1.12, -0.34, 0.455);
      object.position.set(...position);
      object.rotation.set(0, 0, 0);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      mesh.setColorAt(index, new THREE.Color(
        station.status !== 'ACTIVE' ? '#7e8784' : station.isConnected ? '#34b87a' : '#d56051',
      ));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [invalidate, object, stations]);
  return (
    <instancedMesh ref={meshRef} args={[CONNECTION_GEOMETRY, undefined, stations.length]} name="PlayerStationConnections">
      <meshStandardMaterial color="#ffffff" roughness={0.48} metalness={0.05} />
    </instancedMesh>
  );
}

function StationPortrait({ station }: { station: PlayerStationRenderModel }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    setTexture(null);
    return acquireCharacterTexture(station.characterId, station.color, next => {
      setTexture(next);
      invalidate();
    }, () => {
      setTexture(null);
      invalidate();
    });
  }, [invalidate, station.characterId, station.color]);
  if (!texture) return null;
  const position = getStationWorldPoint(station.slot, -1.03, 0, 0.76);
  const disabled = station.status !== 'ACTIVE';
  return (
    <sprite position={position} scale={[0.58, 0.74, 1]} name={`PlayerStationPortrait:${station.playerId}`}>
      <spriteMaterial
        {...getCharacterSpriteMaterialProps(texture)}
        color={disabled ? '#8d9491' : '#ffffff'}
        opacity={disabled ? 0.58 : 1}
      />
    </sprite>
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
      <StationPortrait station={station} />
      <SdfBillboardText
        value={`${station.name}${status ? ` · ${status}` : ''}\nĐẤT ${station.propertyCount} · NHÀ ${station.houseCount} · KS ${station.hotelCount}`}
        position={getStationWorldPoint(station.slot, -0.05, 0, 0.91)}
        fontSize={status ? 0.145 : 0.17}
        maxWidth={1.72}
        lineHeight={1.15}
        color={primary}
        name={`PlayerStationName:${station.playerId}`}
      />
      <SdfBillboardText
        value={formatMoney(station.accountBalance)}
        position={getStationWorldPoint(station.slot, -0.04, 0, 0.6)}
        fontSize={0.27}
        maxWidth={1.5}
        color={primary}
        name={`PlayerStationBalance:${station.playerId}`}
      />
    </>
  );
}

function ActiveTurnMarker({ station }: { station?: PlayerStationRenderModel }) {
  if (!station || station.status !== 'ACTIVE') return null;
  return (
    <mesh
      position={[station.anchor[0], 0.415, station.anchor[2]]}
      rotation={[Math.PI / 2, getStationRotationY(station.slot), 0]}
      scale={[1, 1, 0.42]}
      name={`PlayerStationActive:${station.playerId}`}
    >
      <torusGeometry args={[1.18, 0.038, 8, 32]} />
      <meshStandardMaterial color="#ffe47b" emissive="#d99a24" emissiveIntensity={0.42} roughness={0.4} />
    </mesh>
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
      <SdfBillboardText
        value="NGÂN HÀNG"
        position={[BANK_WORLD_ANCHOR[0], 0.74, BANK_WORLD_ANCHOR[2] - 0.2]}
        fontSize={0.23}
        maxWidth={1.7}
        color="#fff0bd"
        name="BankTreasuryLabel"
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
  const active = stations.find(station => station.isCurrentTurn);
  return (
    <group name="PlayerStationLayer">
      <BankTreasury />
      <StationBases stations={stations} />
      <CoinPiles stations={stations} />
      <ConnectionIndicators stations={stations} />
      {stations.map(station => <StationInformation key={station.playerId} station={station} />)}
      <ActiveTurnMarker station={active} />
      <StationMoneyAmounts stations={stations} moneyTransfers={moneyTransfers} />
    </group>
  );
}
