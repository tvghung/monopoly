import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTER_BILLBOARD_HEIGHT } from '../board/architecture/tileAnchors';
import { applyStandeeOpacity } from './CharacterStandee';
import { setStandeeBaseSink, syncStandeeBasesNow } from './standeeBaseRegistry';
import { MAX_STANDEE_BASES, createStandeeBaseGeometry, syncStandeeBases } from './StandeeBases';
import {
  getStandeeBaseEntries,
  registerStandeeBase,
  resetStandeeBasesForTests,
  subscribeStandeeBases,
} from './standeeBaseRegistry';
import {
  STANDEE_ART_HEIGHT,
  STANDEE_ART_WIDTH,
  STANDEE_BASE_HEIGHT,
  STANDEE_BASE_RADIUS,
  STANDEE_FORESHORTENING,
  STANDEE_HEADING_Y,
  STANDEE_TEXTURE_RATIO,
  createStandeeDepthMaterial,
  getStandeeFaceCenterY,
  getStandeeFaceMaterialProps,
  getStandeeFaceSize,
} from './standeeMaterial';

afterEach(resetStandeeBasesForTests);

describe('standee face', () => {
  it('faces the camera azimuth only: a vertical card, never tilted toward the camera', () => {
    expect(STANDEE_HEADING_Y).toBeCloseTo(Math.PI / 4);
    // The card's normal is horizontal, so it has no vertical component to point at the camera elevation.
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, STANDEE_HEADING_Y, 0));
    expect(normal.y).toBeCloseTo(0);
  });

  it('is taller in the world than the sprite so it is as tall on screen (the camera foreshortens a vertical card)', () => {
    expect(STANDEE_FORESHORTENING).toBeCloseTo(0.749, 3);
    expect(STANDEE_ART_HEIGHT).toBeCloseTo(CHARACTER_BILLBOARD_HEIGHT / 0.749, 1);
    expect(STANDEE_ART_HEIGHT * STANDEE_FORESHORTENING).toBeCloseTo(CHARACTER_BILLBOARD_HEIGHT);
  });

  it('keeps the width of the art and adds the border margin around it', () => {
    const size = getStandeeFaceSize(1);
    expect(size.width).toBeCloseTo(STANDEE_ART_WIDTH * STANDEE_TEXTURE_RATIO);
    expect(size.height).toBeCloseTo(STANDEE_ART_HEIGHT * STANDEE_TEXTURE_RATIO);
    expect(getStandeeFaceSize(0.92).width).toBeCloseTo(size.width * 0.92);
  });

  it('stands the art on the base disc', () => {
    const centerY = getStandeeFaceCenterY(1, 0);
    expect(centerY - (STANDEE_ART_HEIGHT * 1) / 2).toBeCloseTo(STANDEE_BASE_HEIGHT);
    expect(getStandeeFaceCenterY(1, 0.1)).toBeCloseTo(centerY + 0.1);
  });

  it('is unlit and opaque with an alpha test, like the sprite it replaces was unlit', () => {
    const texture = new THREE.Texture();
    expect(getStandeeFaceMaterialProps(texture)).toEqual({
      map: texture, alphaTest: 0.5, transparent: false, toneMapped: false, side: THREE.FrontSide,
    });
  });

  it('casts a shadow with the mascot silhouette: the depth material samples the same texture', () => {
    const texture = new THREE.Texture();
    const depth = createStandeeDepthMaterial(texture);
    expect(depth.map).toBe(texture);
    expect(depth.alphaTest).toBe(0.5);
    expect(depth.depthPacking).toBe(THREE.RGBADepthPacking);
  });

  it('recompiles the material only when it flips between opaque and faded', () => {
    const material = new THREE.MeshBasicMaterial({ alphaTest: 0.5, transparent: false });
    const start = material.version;
    applyStandeeOpacity(material, 1);
    expect(material.version).toBe(start);
    applyStandeeOpacity(material, 0.88);
    expect(material.version).toBe(start + 1);
    applyStandeeOpacity(material, 0.7);
    expect(material.version).toBe(start + 1);
    applyStandeeOpacity(material, 1);
    expect(material.version).toBe(start + 2);
  });

  it('fades through real transparency and returns to the alpha-tested silhouette', () => {
    const material = new THREE.MeshBasicMaterial({ alphaTest: 0.5, transparent: false });
    applyStandeeOpacity(material, 0.4);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.4);
    expect(material.alphaTest).toBeLessThan(0.1);
    applyStandeeOpacity(material, 1);
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.alphaTest).toBe(0.5);
  });
});

describe('standee bases', () => {
  it('is a disc on the ground, a little narrower on top', () => {
    const geometry = createStandeeBaseGeometry();
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(STANDEE_BASE_HEIGHT);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(STANDEE_BASE_RADIUS, 1);
  });

  it('registers and removes bases and tells subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStandeeBases(listener);
    const remove = registerStandeeBase(Symbol('a'), { anchor: new THREE.Object3D(), color: '#ff0000' });
    expect(getStandeeBaseEntries()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    remove();
    expect(getStandeeBaseEntries()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(2);
    remove();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('copies each anchor world matrix and color into one instanced mesh', () => {
    const mesh = new THREE.InstancedMesh(createStandeeBaseGeometry(), new THREE.MeshStandardMaterial(), MAX_STANDEE_BASES);
    mesh.setColorAt(0, new THREE.Color('#ffffff'));
    const parent = new THREE.Group();
    parent.position.set(1, 0, 2);
    const anchorA = new THREE.Object3D();
    anchorA.position.set(0.5, 0.2, 0);
    parent.add(anchorA);
    const anchorB = new THREE.Object3D();
    anchorB.position.set(-3, 0, 4);
    registerStandeeBase(Symbol('a'), { anchor: anchorA, color: '#ff0000' });
    registerStandeeBase(Symbol('b'), { anchor: anchorB, color: '#0000ff' });

    syncStandeeBases(mesh);

    expect(mesh.count).toBe(2);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const positionOf = () => new THREE.Vector3().setFromMatrixPosition(matrix).toArray();
    positionOf().forEach((value, axis) => expect(value).toBeCloseTo([1.5, 0.2, 2][axis], 5));
    mesh.getMatrixAt(1, matrix);
    positionOf().forEach((value, axis) => expect(value).toBeCloseTo([-3, 0, 4][axis], 5));
    const color = new THREE.Color();
    mesh.getColorAt(0, color);
    expect(color.getHexString()).toBe('ff0000');
  });

  it('lets a billboard sync the bases at the end of its frame, through the registered sink', () => {
    const sink = vi.fn();
    expect(() => syncStandeeBasesNow()).not.toThrow();
    setStandeeBaseSink(sink);
    syncStandeeBasesNow();
    syncStandeeBasesNow();
    expect(sink).toHaveBeenCalledTimes(2);
    setStandeeBaseSink(null);
    syncStandeeBasesNow();
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it('draws no base when nobody is seated', () => {
    const mesh = new THREE.InstancedMesh(createStandeeBaseGeometry(), new THREE.MeshStandardMaterial(), MAX_STANDEE_BASES);
    mesh.count = 3;
    syncStandeeBases(mesh);
    expect(mesh.count).toBe(0);
  });
});
