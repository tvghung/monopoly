export const WHITE_PEBBLE_TEXTURE_SIZE = 512;
export const WHITE_PEBBLE_VARIANT_COUNT = 4;
export const WHITE_PEBBLE_SAMPLE_SIZE = 128;
export const WHITE_PEBBLE_VARIANTS = [0, 1, 2, 3] as const;

export const WHITE_PEBBLE_COLORS = [
  '#ECEFF0',
  '#D9DEE0',
  '#C4CBCD',
  '#ABB4B7',
  '#929DA1',
] as const;

export type WhitePebbleShape = 'circle' | 'oval' | 'elongated' | 'irregular';
export type WhitePebbleVariant = 0 | 1 | 2 | 3;

export interface WhitePebbleDescriptor {
  x: number;
  y: number;
  radius: number;
  aspectRatio: number;
  rotation: number;
  color: string;
  shape: WhitePebbleShape;
}

export interface WhitePebbleTextureData {
  albedo: Uint8Array;
  bump: Uint8Array;
  coverage: number;
  pebbles: readonly WhitePebbleDescriptor[];
}

const SHAPES: readonly WhitePebbleShape[] = ['circle', 'oval', 'elongated', 'irregular'];

function hashSeed(value: number): number {
  let hash = (value ^ 0x811c9dc5) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x45d9f3b);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHexColor(value: string): readonly [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

export function getWhitePebbleVariant(tileId: number): WhitePebbleVariant {
  const normalized = Math.abs(Math.trunc(tileId)) % WHITE_PEBBLE_VARIANT_COUNT;
  return normalized as WhitePebbleVariant;
}

export function createWhitePebbleDescriptors(
  variant: WhitePebbleVariant,
  count = 20,
): readonly WhitePebbleDescriptor[] {
  const random = createSeededRandom(0x574850 + variant * 0x9e3779b9);
  return Array.from({ length: count }, (_, index) => {
    const shape = SHAPES[(index + variant) % SHAPES.length];
    const aspectRatio = shape === 'circle'
      ? 1
      : shape === 'oval'
        ? 0.68 + random() * 0.2
        : shape === 'elongated'
          ? 0.34 + random() * 0.18
          : 0.56 + random() * 0.28;
    return {
      x: 0.06 + random() * 0.88,
      y: 0.06 + random() * 0.88,
      radius: 0.024 + random() * 0.019,
      aspectRatio,
      rotation: random() * Math.PI,
      color: WHITE_PEBBLE_COLORS[(index * 3 + variant + Math.floor(random() * 3)) % WHITE_PEBBLE_COLORS.length],
      shape,
    };
  });
}

function isInsidePebble(u: number, v: number, pebble: WhitePebbleDescriptor): boolean {
  const deltaX = u - pebble.x;
  const deltaY = v - pebble.y;
  const cosine = Math.cos(pebble.rotation);
  const sine = Math.sin(pebble.rotation);
  const rotatedX = deltaX * cosine + deltaY * sine;
  const rotatedY = -deltaX * sine + deltaY * cosine;
  const normalizedX = rotatedX / pebble.radius;
  const normalizedY = rotatedY / (pebble.radius * pebble.aspectRatio);
  const distance = normalizedX * normalizedX + normalizedY * normalizedY;
  if (pebble.shape !== 'irregular') return distance <= 1;
  return distance <= 1 + Math.sin(normalizedX * 4.2 + normalizedY * 2.8) * 0.08;
}

export function generateWhitePebbleTextureData(
  variant: WhitePebbleVariant,
  size = WHITE_PEBBLE_TEXTURE_SIZE,
): WhitePebbleTextureData {
  const sampleSize = Math.min(Math.max(1, Math.trunc(size)), WHITE_PEBBLE_SAMPLE_SIZE);
  const pebbles = createWhitePebbleDescriptors(variant);
  const sampleAlbedo = new Uint8Array(sampleSize * sampleSize * 4);
  const sampleBump = new Uint8Array(sampleSize * sampleSize);
  let coveredPixels = 0;

  for (let sampleY = 0; sampleY < sampleSize; sampleY += 1) {
    for (let sampleX = 0; sampleX < sampleSize; sampleX += 1) {
      const u = (sampleX + 0.5) / sampleSize;
      const v = (sampleY + 0.5) / sampleSize;
      const pebble = pebbles.find(candidate => isInsidePebble(u, v, candidate));
      const pixelIndex = sampleY * sampleSize + sampleX;
      const colorIndex = pixelIndex * 4;
      if (!pebble) {
        sampleAlbedo[colorIndex] = 255;
        sampleAlbedo[colorIndex + 1] = 255;
        sampleAlbedo[colorIndex + 2] = 255;
        sampleAlbedo[colorIndex + 3] = 255;
        sampleBump[pixelIndex] = 128;
        continue;
      }
      const [red, green, blue] = parseHexColor(pebble.color);
      sampleAlbedo[colorIndex] = red;
      sampleAlbedo[colorIndex + 1] = green;
      sampleAlbedo[colorIndex + 2] = blue;
      sampleAlbedo[colorIndex + 3] = 255;
      sampleBump[pixelIndex] = 145;
      coveredPixels += 1;
    }
  }

  const albedo = new Uint8Array(size * size * 4);
  const bump = new Uint8Array(size * size);
  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    const sampleY = Math.min(sampleSize - 1, Math.floor(pixelY * sampleSize / size));
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      const sampleX = Math.min(sampleSize - 1, Math.floor(pixelX * sampleSize / size));
      const sampleIndex = sampleY * sampleSize + sampleX;
      const pixelIndex = pixelY * size + pixelX;
      const colorIndex = pixelIndex * 4;
      const sampleColorIndex = sampleIndex * 4;
      albedo[colorIndex] = sampleAlbedo[sampleColorIndex];
      albedo[colorIndex + 1] = sampleAlbedo[sampleColorIndex + 1];
      albedo[colorIndex + 2] = sampleAlbedo[sampleColorIndex + 2];
      albedo[colorIndex + 3] = 255;
      bump[pixelIndex] = sampleBump[sampleIndex];
    }
  }

  return {
    albedo,
    bump,
    coverage: coveredPixels / (sampleSize * sampleSize),
    pebbles,
  };
}
