import * as THREE from 'three';
import { getBoardMaterialProps } from '../../board/materials/boardMaterialSpecs';
import { createDestinationPreviewMaterials } from '../../board/tiles/TileDestinationPreview';
import { createConstructionPuffMaterial } from '../../buildings/ConstructionPuff';
import { createTubeHouseMeshes, disposeTubeHouseMeshes } from '../../buildings/tubeHouseMeshes';
import { applyStandeeOpacity } from '../../characters/CharacterStandee';
import { createStandeeDepthMaterial, getStandeeFaceMaterialProps } from '../../characters/standeeMaterial';
import { createDiceContactShadowMaterial } from '../../dice/DiceContactShadowBatch';
import { createDiceTrailMaterials, getDiceTrailCount } from '../../dice/DiceLayer';
import { DICE_BODY_COLOR } from '../../dice/diceVisualConfig';
import { CONTACT_SHADOW_GEOMETRY } from '../../fx/ContactShadow';
import type { RenderTier } from '../renderQuality';

/**
 * Stand-ins for the program variants that `renderer.compile(scene)` cannot reach (Phase B3).
 *
 * A program is identified by the parameters three.js derives from a material, the object that draws it, the lights and the
 * render target; its source text follows from those. So a hidden proxy with the same material parameters, the same
 * geometry attribute layout and the same instancing flags compiles the very program the real object will ask for, and the
 * program is then found in the renderer's cache instead of linked. The proxies are never added to the scene. They are kept
 * for the life of the renderer on purpose: a program stays cached only while some material references it, so a proxy keeps
 * a variant alive across the moments when no real object uses it (a mascot that is removed and added again would otherwise
 * link its programs again). `dispose()` releases everything the fixtures created and nothing they merely referenced.
 *
 * What is covered:
 *  - Shadow depth passes: derived from the shadow casters actually in the scene, the way `WebGLShadowMap.getDepthMaterial`
 *    derives them (a custom depth material, else the shared depth material with the caster's side, alpha test and maps).
 *    They are drawn into a render target, so they must be compiled with one bound.
 *  - Objects that mount only when a game event needs them: the mascot standee (once its texture has loaded), the dice, the
 *    destination preview, a house build with its dust puff. Each is built from the same exported factory the real component
 *    uses (materials, props, instance-color layout). The zero-links-after-warm-up probe check in scripts/perf is what fails
 *    if a real component and its fixture ever drift apart.
 */

const SHADOW_SIDE: Record<number, THREE.Side> = {
  [THREE.FrontSide]: THREE.BackSide,
  [THREE.BackSide]: THREE.FrontSide,
  [THREE.DoubleSide]: THREE.DoubleSide,
};

const GEOMETRY_ATTRIBUTES = ['normal', 'uv', 'uv1', 'uv2', 'uv3', 'tangent', 'color'] as const;

/** The geometry facts that change a program (attribute layout), as a short key. */
function geometryKey(geometry: THREE.BufferGeometry): string {
  return GEOMETRY_ATTRIBUTES
    .map(name => {
      const attribute = geometry.getAttribute(name);
      return attribute ? `${name}${attribute.itemSize}` : '';
    })
    .join(',');
}

type DepthCapableMaterial = THREE.Material & {
  map?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
  displacementMap?: THREE.Texture | null;
  alphaTest: number;
  alphaToCoverage: boolean;
  shadowSide: THREE.Side | null;
};

export class WarmupFixtures {
  /** Proxies compiled with the scene as lighting target and no render target (what the screen draws). */
  readonly main = new THREE.Group();

  /** Proxies of the shadow depth passes; compile with `depthTarget` bound. */
  readonly depth = new THREE.Group();

  readonly depthTarget = new THREE.WebGLRenderTarget(1, 1);

  private readonly depthKeys = new Set<string>();
  private readonly owned: Array<{ dispose(): void }> = [this.depthTarget];
  private standeeAdded = false;
  private construction = false;
  private preview = false;
  private diceTier: RenderTier | null = null;
  private readonly diceObjects: THREE.Object3D[] = [];
  private diceBody: { geometry: THREE.BufferGeometry; material: THREE.Material } | null = null;
  private diceTrail: THREE.Material | null = null;
  private diceShadow: { geometry: THREE.BufferGeometry; material: THREE.Material } | null = null;

  /**
   * Adds a depth proxy for every shadow caster variant in `root` that has none yet. Safe to call again after the scene
   * changed (a tier switch mounts other casters).
   */
  syncShadowCasters(root: THREE.Object3D): void {
    root.traverse(object => {
      if (!(object as THREE.Mesh).isMesh || !object.castShadow) return;
      const mesh = object as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) this.addDepthProxy(mesh, material);
    });
  }

  private addDepthProxy(mesh: THREE.Mesh, caster: DepthCapableMaterial): void {
    const custom = mesh.customDepthMaterial;
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh === true;
    const instanceColor = instanced && (mesh as THREE.InstancedMesh).instanceColor !== null;
    const key = [
      custom ? `custom:${custom.type}:${(custom as THREE.MeshDepthMaterial).depthPacking ?? ''}` : 'default',
      instanced ? 'instanced' : 'single',
      instanceColor ? 'color' : '',
      caster.side,
      caster.shadowSide ?? '',
      caster.alphaTest > 0 || caster.alphaToCoverage ? 'alpha' : '',
      caster.map ? `map${caster.map.channel}` : '',
      caster.alphaMap ? `alphaMap${caster.alphaMap.channel}` : '',
      caster.displacementMap ? 'displacement' : '',
      geometryKey(mesh.geometry),
    ].join('|');
    if (this.depthKeys.has(key)) return;
    this.depthKeys.add(key);

    // The same assignments WebGLShadowMap.getDepthMaterial makes before it draws a caster.
    const material = (custom ? custom.clone() : new THREE.MeshDepthMaterial()) as THREE.MeshDepthMaterial;
    material.side = caster.shadowSide ?? SHADOW_SIDE[caster.side] ?? THREE.BackSide;
    material.alphaMap = caster.alphaMap ?? null;
    material.alphaTest = caster.alphaToCoverage ? 0.5 : caster.alphaTest;
    material.map = caster.map ?? null;
    material.displacementMap = caster.displacementMap ?? null;
    this.owned.push(material);
    this.depth.add(this.proxyMesh(mesh.geometry, material, instanced, instanceColor));
  }

  /**
   * The mascot standee mounts only after its picture has been rasterised, so the scene holds no standee when the warm-up
   * runs. Its face (opaque, and the faded variant a bankruptcy uses) and its mascot-shaped shadow are built from the same
   * material factories the real standee uses, with a one-pixel picture in place of the mascot.
   */
  addStandee(): void {
    if (this.standeeAdded) return;
    this.standeeAdded = true;
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.PlaneGeometry(1, 1);
    this.owned.push(texture, plane);

    const face = new THREE.MeshBasicMaterial(getStandeeFaceMaterialProps(texture));
    const fadingFace = new THREE.MeshBasicMaterial(getStandeeFaceMaterialProps(texture));
    applyStandeeOpacity(fadingFace, 0.5);
    this.owned.push(face, fadingFace);
    this.main.add(this.proxyMesh(plane, face, false, false), this.proxyMesh(plane, fadingFace, false, false));

    const depth = createStandeeDepthMaterial(texture);
    depth.side = THREE.BackSide;
    depth.alphaTest = 0.5;
    depth.map = texture;
    this.owned.push(depth);
    this.depth.add(this.proxyMesh(plane, depth, false, false));
  }

  /**
   * The dice (body, trails, contact shadow). They mount the first time a roll is shown. The body geometry is a plain box:
   * only its attribute layout (position, normal, uv) takes part in the program, not its shape, and the real one costs about
   * a frame to build. Trails exist from the Balanced tier up and the body casts a shadow on High only (as DiceLayer does).
   */
  addDice(tier: RenderTier): void {
    if (this.diceTier === tier) return;
    this.diceTier = tier;
    for (const object of this.diceObjects) object.removeFromParent();
    this.diceObjects.length = 0;
    this.diceBody ??= {
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshPhysicalMaterial(getBoardMaterialProps('diceBody', DICE_BODY_COLOR)),
    };
    const body = new THREE.Mesh(this.diceBody.geometry, this.diceBody.material);
    body.castShadow = tier === 'high';
    this.diceObjects.push(body);
    if (getDiceTrailCount(tier) > 0) {
      this.diceTrail ??= createDiceTrailMaterials(1)[0];
      this.diceObjects.push(new THREE.Mesh(this.diceBody.geometry, this.diceTrail));
    }
    this.diceShadow ??= {
      geometry: CONTACT_SHADOW_GEOMETRY,
      material: createDiceContactShadowMaterial(),
    };
    this.diceObjects.push(new THREE.InstancedMesh(this.diceShadow.geometry, this.diceShadow.material, 2));
    this.main.add(...this.diceObjects);
    this.syncShadowCasters(this.main);
  }

  /** The destination preview's surface and frame; one material pair serves both, as the board's shared pair does. */
  addDestinationPreview(): void {
    if (this.preview) return;
    const materials = createDestinationPreviewMaterials();
    const plane = new THREE.PlaneGeometry(1, 1);
    this.owned.push(materials.surface, materials.edge, plane);
    this.preview = true;
    this.main.add(new THREE.Mesh(plane, materials.surface), new THREE.Mesh(plane, materials.edge));
  }

  /**
   * Building a house: the instanced house meshes (an instance color is written the moment a house exists, which is a different
   * program from the colorless one the empty layer compiles) and the instanced dust puff of the build and hotel bursts.
   */
  addConstruction(): void {
    if (this.construction) return;
    this.construction = true;
    const houses = createTubeHouseMeshes();
    for (const mesh of [houses.body, houses.trim, houses.roof]) mesh.setColorAt(0, new THREE.Color());
    this.owned.push({ dispose: () => disposeTubeHouseMeshes(houses) });
    this.main.add(houses.body, houses.trim, houses.roof);
    const puffMaterial = createConstructionPuffMaterial();
    const puffGeometry = new THREE.OctahedronGeometry(0.068, 0);
    this.owned.push(puffMaterial, puffGeometry);
    const puff = new THREE.InstancedMesh(puffGeometry, puffMaterial, 11);
    puff.setColorAt(0, new THREE.Color());
    this.main.add(puff);
    this.syncShadowCasters(this.main);
  }

  dispose(): void {
    for (const resource of this.owned) resource.dispose();
    this.owned.length = 0;
    for (const resource of [this.diceBody?.geometry, this.diceBody?.material, this.diceTrail, this.diceShadow?.material]) resource?.dispose();
    this.diceBody = null;
    this.diceTrail = null;
    this.diceShadow = null;
    this.main.clear();
    this.depth.clear();
    this.depthKeys.clear();
  }

  private proxyMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    instanced: boolean,
    instanceColor: boolean,
  ): THREE.Mesh {
    const proxy = instanced ? new THREE.InstancedMesh(geometry, material, 1) : new THREE.Mesh(geometry, material);
    if (instanced && instanceColor) (proxy as THREE.InstancedMesh).setColorAt(0, new THREE.Color());
    proxy.frustumCulled = false;
    return proxy;
  }
}
