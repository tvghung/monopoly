import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { WarmupFixtures } from './warmupFixtures';

let fixtures: WarmupFixtures | null = null;
afterEach(() => {
  fixtures?.dispose();
  fixtures = null;
});

function create(): WarmupFixtures {
  fixtures = new WarmupFixtures();
  return fixtures;
}

const geometryWith = (...attributes: Array<[string, number]>): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  for (const [name, size] of attributes) geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(size * 3), size));
  return geometry;
};

const caster = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], castShadow = true): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = castShadow;
  return mesh;
};

const materialTypes = (group: THREE.Group): string[] => group.children
  .map(child => ((child as THREE.Mesh).material as THREE.Material).type);

const depthMaterials = (set: WarmupFixtures): THREE.MeshDepthMaterial[] => set.depth.children
  .map(child => (child as THREE.Mesh).material as THREE.MeshDepthMaterial);

describe('WarmupFixtures.syncShadowCasters', () => {
  it('derives the depth material the shadow pass will use: the caster flipped side, with its alpha test and map', () => {
    const set = create();
    const scene = new THREE.Scene();
    const map = new THREE.Texture();
    scene.add(caster(geometryWith(['normal', 3]), new THREE.MeshStandardMaterial()));
    scene.add(caster(geometryWith(['normal', 3], ['uv', 2]), new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide })));

    set.syncShadowCasters(scene);

    const [plain, alpha] = depthMaterials(set);
    expect(plain.type).toBe('MeshDepthMaterial');
    expect(plain.side).toBe(THREE.BackSide);
    expect(plain.map).toBeNull();
    expect(alpha.side).toBe(THREE.DoubleSide);
    expect(alpha.map).toBe(map);
    expect(alpha.alphaTest).toBe(0.5);
  });

  it('ignores meshes that do not cast and does not add a proxy for a variant it already has', () => {
    const set = create();
    const scene = new THREE.Scene();
    scene.add(caster(geometryWith(['normal', 3]), new THREE.MeshStandardMaterial(), false));
    scene.add(caster(geometryWith(['normal', 3]), new THREE.MeshStandardMaterial()));
    scene.add(caster(geometryWith(['normal', 3]), new THREE.MeshPhysicalMaterial()));
    set.syncShadowCasters(scene);
    set.syncShadowCasters(scene);
    expect(set.depth.children).toHaveLength(1);
  });

  it('keeps instancing, instance colors and the attribute layout apart, because each is its own program', () => {
    const set = create();
    const scene = new THREE.Scene();
    const withColor = new THREE.InstancedMesh(geometryWith(['normal', 3]), new THREE.MeshStandardMaterial(), 2);
    withColor.setColorAt(0, new THREE.Color());
    withColor.castShadow = true;
    const withoutColor = new THREE.InstancedMesh(geometryWith(['normal', 3]), new THREE.MeshStandardMaterial(), 2);
    withoutColor.castShadow = true;
    scene.add(withColor, withoutColor);
    scene.add(caster(geometryWith(['normal', 3]), new THREE.MeshStandardMaterial()));
    scene.add(caster(geometryWith(['normal', 3], ['color', 3]), new THREE.MeshStandardMaterial()));

    set.syncShadowCasters(scene);

    expect(set.depth.children).toHaveLength(4);
    const instanced = set.depth.children.filter(child => (child as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    expect(instanced.map(mesh => mesh.instanceColor !== null).sort()).toEqual([false, true]);
  });

  it('builds on a custom depth material when the caster has one, and reapplies the caster state to it', () => {
    const set = create();
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const mesh = caster(geometryWith(['normal', 3], ['uv', 2]), new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 }));
    const custom = new THREE.MeshDepthMaterial({ map: texture, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
    mesh.customDepthMaterial = custom;
    scene.add(mesh);

    set.syncShadowCasters(scene);

    const [proxy] = depthMaterials(set);
    expect(proxy).not.toBe(custom);
    expect(proxy.depthPacking).toBe(THREE.RGBADepthPacking);
    expect(proxy.side).toBe(THREE.BackSide);
    expect(proxy.map).toBe(texture);
    custom.dispose();
  });
});

describe('WarmupFixtures families', () => {
  it('adds the mascot standee once: an opaque face, a fading face and its mascot-shaped shadow', () => {
    const set = create();
    set.addStandee();
    set.addStandee();

    const faces = set.main.children.map(child => (child as THREE.Mesh).material as THREE.MeshBasicMaterial);
    expect(faces.map(material => material.transparent)).toEqual([false, true]);
    expect(faces[0].alphaTest).toBe(0.5);
    expect(faces[1].alphaTest).toBe(0.04);
    expect(depthMaterials(set)).toHaveLength(1);
    expect(depthMaterials(set)[0].depthPacking).toBe(THREE.RGBADepthPacking);
  });

  it('adds dice by tier: no trail on Low, a trail on Balanced, and a shadow-casting body only on High', () => {
    const set = create();

    set.addDice('low');
    expect(materialTypes(set.main)).toEqual(['MeshPhysicalMaterial', 'ShaderMaterial']);
    expect(set.depth.children).toHaveLength(0);

    set.addDice('balanced');
    expect(materialTypes(set.main).sort()).toEqual(['MeshBasicMaterial', 'MeshPhysicalMaterial', 'ShaderMaterial']);

    set.addDice('high');
    expect(set.main.children.some(child => child.castShadow)).toBe(true);
    expect(set.depth.children).toHaveLength(1);

    // Changing the tier replaces the dice objects, it does not stack them.
    set.addDice('balanced');
    expect(set.main.children).toHaveLength(3);
    expect(set.main.children.some(child => child.castShadow)).toBe(false);
  });

  it('adds the destination preview and the construction effects once', () => {
    const set = create();
    set.addDestinationPreview();
    set.addDestinationPreview();
    expect(set.main.children).toHaveLength(2);

    set.addConstruction();
    set.addConstruction();
    const instanced = set.main.children.filter(child => (child as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    // Three house meshes and the dust puff, each with an instance color (the layout that appears when a house exists).
    expect(instanced).toHaveLength(4);
    expect(instanced.every(mesh => mesh.instanceColor !== null)).toBe(true);
    expect(set.depth.children.length).toBeGreaterThan(0);
  });

  it('releases what it created on dispose', () => {
    const set = create();
    set.addStandee();
    set.addDice('high');
    set.addDestinationPreview();
    set.addConstruction();
    set.dispose();
    expect(set.main.children).toHaveLength(0);
    expect(set.depth.children).toHaveLength(0);
  });
});
