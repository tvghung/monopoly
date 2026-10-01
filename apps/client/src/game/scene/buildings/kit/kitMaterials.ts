import * as THREE from 'three';

/**
 * The three shared materials of the low-poly kit (plan 05 §8.1). They are module-level singletons, created once and never
 * disposed (like the card decks): every building, landmark and prop of the board uses them, so the whole kit costs at most
 * three material programs.
 */

/** Opaque lit parts: walls, roofs, plinths. Vertex colors carry the palette; an instance color tints on top. */
export const kitOpaqueMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.55,
  metalness: 0,
});
kitOpaqueMaterial.name = 'KitOpaque';

/** Glass of towers: smoother and a little metallic, still vertex-colored. */
export const kitGlassMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.18,
  metalness: 0.35,
});
kitGlassMaterial.name = 'KitGlass';

/** Lamps and lanterns: unlit and not tone-mapped, so the bloom of the high tier picks them up. */
export const kitEmissiveMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false,
});
kitEmissiveMaterial.name = 'KitEmissive';

/** The "street pastel" facade colors (plan 05 §8.1). */
export const STREET_PASTELS = ['#BFE8D6', '#F6E3A1', '#F4B6A0', '#BFD9F2', '#D8C8EE', '#F5ECDC'] as const;
