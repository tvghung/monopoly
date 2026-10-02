import type * as THREE from 'three';
import { box, cylinder, lathe, measureGeometry, mergeKit, triangleCount, type Vec2 } from '../buildings/kit/lowPolyKit';

/**
 * The four table props of plan 05 §8.6, built in code with the low-poly kit (decision OD-05-2: no glTF): a cà phê phin, a nón
 * lá, a bát sen and a stack of play money. Each is one merged, vertex-colored geometry (one draw), standing on y = 0 and
 * centered on x = 0, z = 0, a toy-sized object on the oak table beside the board. Colors sit on the light oak (plan 02).
 */
export type TablePropId = 'coffee-phin' | 'non-la' | 'lotus-bowl' | 'play-money';

export interface TablePropGeometry {
  geometry: THREE.BufferGeometry;
  triangles: number;
  /** Radius of the smallest circle round the footprint, centered on the origin. */
  radius: number;
  height: number;
}

/** The per-prop and total budgets of plan 05 §8.6: at most 4 props, 4 draws and 3,000 triangles together. */
export const TABLE_PROP_LIMITS = {
  maxProps: 4,
  maxTriangles: 3000,
  maxDraws: 4,
  /** Props are small objects: nothing is wider than this (world units; a tile is about 1.6 wide). */
  maxRadius: 0.7,
  maxHeight: 1.1,
} as const;

function finish(parts: readonly THREE.BufferGeometry[]): TablePropGeometry {
  const geometry = mergeKit(parts);
  const position = geometry.getAttribute('position');
  let radius = 0;
  for (let index = 0; index < position.count; index += 1) {
    radius = Math.max(radius, Math.hypot(position.getX(index), position.getZ(index)));
  }
  return { geometry, triangles: triangleCount(geometry), radius, height: measureGeometry(geometry).max[1] };
}

// --- Cà phê phin: a glass of coffee on a saucer with the steel filter on top ---
const PORCELAIN = '#F7F3EA';
const GLASS = '#DCEEF0';
const COFFEE = '#4A2A18';
const STEEL = '#C9CED3';
const STEEL_DARK = '#9AA1A8';

export function buildCoffeePhin(): TablePropGeometry {
  const cupAt = 0.05;
  const phinAt = cupAt + 0.5;
  return finish([
    lathe([[0, 0], [0.42, 0], [0.58, 0.05], [0.58, 0.075], [0.4, 0.05], [0, 0.045]], 12, PORCELAIN),
    // The glass: dark coffee in its lower part, clear glass above the coffee line.
    lathe([[0.26, 0], [0.3, 0.03], [0.336, 0.27]], 12, COFFEE, { position: [0, cupAt, 0] }),
    lathe([[0.336, 0.27], [0.37, 0.5], [0.355, 0.5], [0.32, 0.27]], 12, GLASS, { position: [0, cupAt, 0] }),
    // The phin: a flange resting on the rim, the chamber, its press lid and a knob.
    cylinder(0.44, 0.44, 0.03, 12, STEEL, { position: [0, phinAt, 0] }),
    cylinder(0.27, 0.3, 0.2, 12, STEEL, { position: [0, phinAt + 0.03, 0] }),
    cylinder(0.3, 0.3, 0.03, 12, STEEL_DARK, { position: [0, phinAt + 0.23, 0] }),
    cylinder(0.045, 0.06, 0.07, 6, STEEL_DARK, { position: [0, phinAt + 0.26, 0] }),
  ]);
}

// --- Nón lá: a conical straw hat with ridge rings, a red rim band and a knotted strap ---
const STRAW = '#DDBB66';
const STRAW_DARK = '#B8954A';
const STRAP = '#C8352D';

export function buildNonLa(): TablePropGeometry {
  const rings = 6;
  const radius = 0.62;
  const height = 0.64;
  const lip = 0.012;
  // Each ring is a short slope; between two rings a small ledge gives the ridge a visible edge in flat shading.
  const profile: Vec2[] = [];
  for (let ring = 0; ring < rings; ring += 1) {
    const lowerRadius = radius * (1 - ring / rings);
    const upperRadius = radius * (1 - (ring + 1) / rings);
    profile.push([lowerRadius + lip, (height * ring) / rings], [upperRadius, (height * (ring + 1)) / rings]);
  }
  return finish([
    lathe(profile, 12, STRAW),
    cylinder(0.634, 0.634, 0.02, 12, STRAP, { position: [0, 0.004, 0] }),
    cylinder(0.02, 0.03, 0.05, 6, STRAW_DARK, { position: [0, height, 0] }),
    // The strap's knot at the rim.
    box(0.07, 0.05, 0.05, STRAP, { position: [0.55, 0.02, 0.12], rotation: [0, 0.4, 0] }),
  ]);
}

// --- Bát sen: a blue-rimmed bowl with water, two floating leaves and three lotus buds ---
const CERAMIC = '#F2F0EA';
const BLUE = '#2F6FA8';
const WATER = '#8FD3D0';
const STEM = '#4F8A4A';
const LEAF = '#5FA84E';
const PINK = '#F2A6C0';

/** A lotus bud: a pointed, slightly swollen egg of pink petals. */
function lotusBud(x: number, z: number, y: number, stemHeight: number, lean: number): THREE.BufferGeometry[] {
  // The stem and the bud lean together about the foot of the stem; the bud sits on top of it.
  const topX = x - Math.sin(lean) * stemHeight;
  const topY = y + Math.cos(lean) * stemHeight;
  return [
    cylinder(0.016, 0.022, stemHeight, 5, STEM, { position: [x, y, z], rotation: [0, 0, lean] }),
    lathe([[0, 0], [0.075, 0.03], [0.1, 0.1], [0.06, 0.19], [0, 0.24]], 8, PINK, { position: [topX, topY, z], rotation: [0, 0, lean] }),
  ];
}

export function buildLotusBowl(): TablePropGeometry {
  const waterY = 0.22;
  return finish([
    lathe([[0, 0], [0.2, 0], [0.26, 0.04], [0.5, 0.2], [0.58, 0.33], [0.55, 0.33], [0.47, 0.26], [0.3, 0.13], [0, 0.1]], 12, CERAMIC),
    // The blue rim: a thin ring round the lip.
    lathe([[0.585, 0.3], [0.585, 0.33], [0.55, 0.33]], 12, BLUE),
    cylinder(0.465, 0.465, 0.01, 12, WATER, { position: [0, waterY, 0] }),
    cylinder(0.2, 0.2, 0.012, 10, LEAF, { position: [0.18, waterY + 0.008, 0.18] }),
    cylinder(0.15, 0.15, 0.012, 10, LEAF, { position: [-0.26, waterY + 0.008, 0.1] }),
    ...lotusBud(0.02, -0.02, waterY, 0.42, 0.04),
    ...lotusBud(-0.2, -0.16, waterY, 0.34, 0.14),
    ...lotusBud(0.2, -0.2, waterY, 0.26, -0.12),
  ]);
}

// --- Tiền chơi: a banded stack of play money and a small second stack, in the pastel colors of the game ---
const NOTE_WIDTH = 0.84;
const NOTE_DEPTH = 0.42;
const NOTE_HEIGHT = 0.03;
/** Fictional notes: no real currency, no text; just paper colors (vertex colors only). */
const NOTE_COLORS = ['#E8C86A', '#6FB79C', '#D9625A', '#6C8FD0', '#F2B6A0', '#B9A3E3', '#E8C86A'] as const;
const NOTE_GOLD = '#E3B94E';

/** A stack of notes, each turned a little from the one below, centered on `(x, z)` and turned `heading` as a whole. */
function noteStack(x: number, z: number, heading: number, scale: number, colors: readonly string[]): THREE.BufferGeometry[] {
  return colors.map((color, index) => box(NOTE_WIDTH, NOTE_HEIGHT, NOTE_DEPTH, color, {
    position: [x, index * NOTE_HEIGHT, z],
    rotation: [0, heading + (index - (colors.length - 1) / 2) * 0.07, 0],
    scale: [scale, 1, scale],
  }));
}

export function buildPlayMoney(): TablePropGeometry {
  const top = NOTE_COLORS.length * NOTE_HEIGHT;
  const topTurn = 0.175;
  return finish([
    ...noteStack(0, -0.2, 0, 1, NOTE_COLORS),
    // The top note's printed design: a cream border panel and a gold medallion.
    box(NOTE_WIDTH * 0.8, 0.004, NOTE_DEPTH * 0.66, PORCELAIN, { position: [-0.04, top, -0.2], rotation: [0, topTurn, 0] }),
    cylinder(0.09, 0.09, 0.006, 10, NOTE_GOLD, { position: [-0.12, top + 0.004, -0.19] }),
    // A paper band round the right third of the stack.
    box(0.13, top + 0.014, NOTE_DEPTH + 0.03, CERAMIC, { position: [0.22, 0, -0.2] }),
    // A second, smaller stack in front.
    ...noteStack(-0.05, 0.28, 0.5, 0.74, NOTE_COLORS.slice(1, 4)),
  ]);
}

export const TABLE_PROP_BUILDERS: Readonly<Record<TablePropId, () => TablePropGeometry>> = {
  'coffee-phin': buildCoffeePhin,
  'non-la': buildNonLa,
  'lotus-bowl': buildLotusBowl,
  'play-money': buildPlayMoney,
};
