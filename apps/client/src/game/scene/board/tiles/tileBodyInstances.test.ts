import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { boardVisualTokens } from '../boardVisualTokens';
import {
  TILE_BODY_CENTER_Y,
  applyTileBodyColors,
  buildBodyEntries,
  createTileBodyGeometry,
  createTileBodyMesh,
  sameBodyEntries,
  syncTileBodyOffsets,
  tileBodyColor,
  type BodyEntry,
} from './tileBodyInstances';

const tiles = Array.from({ length: 40 }, (_, tileId) => ({ tileId })) as unknown as Parameters<typeof buildBodyEntries>[0];
const entries = buildBodyEntries(tiles);

function colorAt(mesh: THREE.InstancedMesh, index: number): THREE.Color {
  const color = new THREE.Color();
  mesh.getColorAt(index, color);
  return color;
}

const hex = (color: string) => new THREE.Color(color).getHexString();

describe('tile body instances', () => {
  it('builds one entry per board tile with normal and special chassis colors', () => {
    expect(entries).toHaveLength(40);
    expect(entries[1].baseColor).toBe(boardVisualTokens.tileChassis);
    expect(entries[0].baseColor).toBe(boardVisualTokens.tileChassisSpecial);
  });

  it('prefers selection over hover over the base color', () => {
    const entry = entries[1];
    expect(tileBodyColor(entry, null, null)).toBe(entry.baseColor);
    expect(tileBodyColor(entry, 1, null)).toBe(boardVisualTokens.tileChassisHover);
    expect(tileBodyColor(entry, 1, 1)).toBe(boardVisualTokens.tileChassisSelected);
    expect(tileBodyColor(entry, 2, 3)).toBe(entry.baseColor);
  });

  it('compares entry lists by identity of the bodies, not by array identity', () => {
    expect(sameBodyEntries(entries, buildBodyEntries(tiles))).toBe(true);
    const changed: BodyEntry[] = entries.map((entry, index) => (index === 3 ? { ...entry, baseColor: '#000000' } : entry));
    expect(sameBodyEntries(entries, changed)).toBe(false);
    expect(sameBodyEntries(entries, entries.slice(1))).toBe(false);
  });

  it('draws every body with one mesh and one white-tinted material', () => {
    const geometry = createTileBodyGeometry();
    const mesh = createTileBodyMesh(entries, geometry);

    expect(mesh.count).toBe(40);
    expect(Array.isArray(mesh.material)).toBe(false);
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ffffff');
    expect(colorAt(mesh, 1).getHexString()).toBe(hex(boardVisualTokens.tileChassis));
    expect(colorAt(mesh, 0).getHexString()).toBe(hex(boardVisualTokens.tileChassisSpecial));
  });

  it('re-colors on hover and selection without allocating a mesh, geometry or material', () => {
    const geometry = createTileBodyGeometry();
    const mesh = createTileBodyMesh(entries, geometry);
    const material = mesh.material;
    const instanceColor = mesh.instanceColor;

    expect(applyTileBodyColors(mesh, entries, 1, null)).toBe(true);
    expect(colorAt(mesh, 1).getHexString()).toBe(hex(boardVisualTokens.tileChassisHover));
    expect(applyTileBodyColors(mesh, entries, 1, 3)).toBe(true);
    expect(colorAt(mesh, 3).getHexString()).toBe(hex(boardVisualTokens.tileChassisSelected));
    expect(colorAt(mesh, 1).getHexString()).toBe(hex(boardVisualTokens.tileChassisHover));
    expect(applyTileBodyColors(mesh, entries, null, null)).toBe(true);
    expect(colorAt(mesh, 1).getHexString()).toBe(hex(boardVisualTokens.tileChassis));

    expect(mesh.material).toBe(material);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.instanceColor).toBe(instanceColor);
  });

  it('reports no change when the colors are already current', () => {
    const mesh = createTileBodyMesh(entries, createTileBodyGeometry());

    expect(applyTileBodyColors(mesh, entries, null, null)).toBe(false);
    expect(applyTileBodyColors(mesh, entries, 5, null)).toBe(true);
    expect(applyTileBodyColors(mesh, entries, 5, null)).toBe(false);
  });

  it('rewrites only the tiles whose motion offset changed', () => {
    const mesh = createTileBodyMesh(entries, createTileBodyGeometry());
    const previous = new Map<number, number>();
    const moving = (tileId: number) => (tileId === 7 ? 0.2 : 0);

    expect(syncTileBodyOffsets(mesh, entries, moving, previous)).toBe(true);
    expect(previous.get(7)).toBe(0.2);
    expect(syncTileBodyOffsets(mesh, entries, moving, previous)).toBe(false);
    expect(syncTileBodyOffsets(mesh, entries, () => 0, previous)).toBe(true);
    expect(previous.get(7)).toBe(0);

    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(entries.findIndex(entry => entry.tileId === 7), matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).y).toBeCloseTo(TILE_BODY_CENTER_Y);
  });
});
