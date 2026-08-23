import * as THREE from 'three';

export const BUILDING_FACADE_TEXTURE_SIZE = 128;
export const HOUSE_FACADE_WALL_COLOR = '#d9d2c2';
export const HOTEL_FACADE_WALL_COLOR = '#d5d8d6';
export const FACADE_WINDOW_PANE_COLOR = '#f7f3e5';
export const FACADE_WINDOW_FRAME_COLOR = '#66727a';
export const FACADE_TEXTURE_TINT = '#ffffff';

export interface BuildingFacadeSpec {
  readonly kind: 'house' | 'hotel';
  readonly columns: number;
  readonly rows: number;
  readonly wallColor: string;
  readonly windowMarginX: number;
  readonly windowGapX: number;
  readonly windowMarginY: number;
  readonly windowGapY: number;
  readonly framePixels: number;
  readonly muntinPixels: number;
}

export const HOUSE_FACADE_SPEC: BuildingFacadeSpec = {
  kind: 'house',
  columns: 2,
  rows: 1,
  wallColor: HOUSE_FACADE_WALL_COLOR,
  windowMarginX: 0.1,
  windowGapX: 0.08,
  windowMarginY: 0.28,
  windowGapY: 0,
  framePixels: 3,
  muntinPixels: 3,
};

export const HOTEL_FACADE_SPEC: BuildingFacadeSpec = {
  kind: 'hotel',
  columns: 2,
  rows: 3,
  wallColor: HOTEL_FACADE_WALL_COLOR,
  windowMarginX: 0.1,
  windowGapX: 0.08,
  windowMarginY: 0.08,
  windowGapY: 0.045,
  framePixels: 3,
  muntinPixels: 3,
};

export interface FacadeWindowRegion {
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FacadePaneRegion {
  readonly column: number;
  readonly row: number;
  readonly pane: 0 | 1 | 2 | 3;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BuildingFacadeTextureData {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly windows: readonly FacadeWindowRegion[];
  readonly panes: readonly FacadePaneRegion[];
}

interface RgbColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

function parseHexColor(value: string): RgbColor {
  const hex = value.replace('#', '');
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function fillRect(
  data: Uint8Array,
  size: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  color: RgbColor,
): void {
  const xStart = Math.max(0, Math.min(size, Math.floor(left)));
  const yStart = Math.max(0, Math.min(size, Math.floor(top)));
  const xEnd = Math.max(xStart, Math.min(size, Math.ceil(right)));
  const yEnd = Math.max(yStart, Math.min(size, Math.ceil(bottom)));
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const colorIndex = (y * size + x) * 4;
      data[colorIndex] = color.red;
      data[colorIndex + 1] = color.green;
      data[colorIndex + 2] = color.blue;
      data[colorIndex + 3] = 255;
    }
  }
}

export function getFacadeWindowRegions(
  spec: BuildingFacadeSpec,
): readonly FacadeWindowRegion[] {
  const windowWidth = (
    1 - spec.windowMarginX * 2 - spec.windowGapX * (spec.columns - 1)
  ) / spec.columns;
  const windowHeight = (
    1 - spec.windowMarginY * 2 - spec.windowGapY * (spec.rows - 1)
  ) / spec.rows;
  return Array.from({ length: spec.columns * spec.rows }, (_, index) => {
    const column = index % spec.columns;
    const row = Math.floor(index / spec.columns);
    return {
      column,
      row,
      x: spec.windowMarginX + column * (windowWidth + spec.windowGapX),
      y: spec.windowMarginY + row * (windowHeight + spec.windowGapY),
      width: windowWidth,
      height: windowHeight,
    };
  });
}

export function getFacadePaneRegions(
  spec: BuildingFacadeSpec,
  size = BUILDING_FACADE_TEXTURE_SIZE,
): readonly FacadePaneRegion[] {
  return getFacadeWindowRegions(spec).flatMap(window => {
    const left = Math.round(window.x * size) + spec.framePixels;
    const top = Math.round(window.y * size) + spec.framePixels;
    const right = Math.round((window.x + window.width) * size) - spec.framePixels;
    const bottom = Math.round((window.y + window.height) * size) - spec.framePixels;
    const splitWidth = (right - left - spec.muntinPixels) / 2;
    const splitHeight = (bottom - top - spec.muntinPixels) / 2;
    return [
      { column: window.column, row: window.row, pane: 0 as const, x: left, y: top, width: splitWidth, height: splitHeight },
      { column: window.column, row: window.row, pane: 1 as const, x: left + splitWidth + spec.muntinPixels, y: top, width: splitWidth, height: splitHeight },
      { column: window.column, row: window.row, pane: 2 as const, x: left, y: top + splitHeight + spec.muntinPixels, width: splitWidth, height: splitHeight },
      { column: window.column, row: window.row, pane: 3 as const, x: left + splitWidth + spec.muntinPixels, y: top + splitHeight + spec.muntinPixels, width: splitWidth, height: splitHeight },
    ];
  });
}

export function generateBuildingFacadeTextureData(
  spec: BuildingFacadeSpec,
  size = BUILDING_FACADE_TEXTURE_SIZE,
): BuildingFacadeTextureData {
  const normalizedSize = Math.max(1, Math.trunc(size));
  const data = new Uint8Array(normalizedSize * normalizedSize * 4);
  const wallColor = parseHexColor(spec.wallColor);
  const paneColor = parseHexColor(FACADE_WINDOW_PANE_COLOR);
  const frameColor = parseHexColor(FACADE_WINDOW_FRAME_COLOR);
  fillRect(data, normalizedSize, 0, 0, normalizedSize, normalizedSize, wallColor);

  getFacadeWindowRegions(spec).forEach(window => {
    const left = Math.round(window.x * normalizedSize);
    const top = Math.round(window.y * normalizedSize);
    const right = Math.round((window.x + window.width) * normalizedSize);
    const bottom = Math.round((window.y + window.height) * normalizedSize);
    fillRect(data, normalizedSize, left, top, right, bottom, frameColor);
    const innerLeft = left + spec.framePixels;
    const innerTop = top + spec.framePixels;
    const innerRight = right - spec.framePixels;
    const innerBottom = bottom - spec.framePixels;
    fillRect(data, normalizedSize, innerLeft, innerTop, innerRight, innerBottom, paneColor);
    const splitX = innerLeft + (innerRight - innerLeft - spec.muntinPixels) / 2;
    const splitY = innerTop + (innerBottom - innerTop - spec.muntinPixels) / 2;
    fillRect(data, normalizedSize, splitX, innerTop, splitX + spec.muntinPixels, innerBottom, frameColor);
    fillRect(data, normalizedSize, innerLeft, splitY, innerRight, splitY + spec.muntinPixels, frameColor);
  });

  return {
    data,
    width: normalizedSize,
    height: normalizedSize,
    windows: getFacadeWindowRegions(spec),
    panes: getFacadePaneRegions(spec, normalizedSize),
  };
}

function createFacadeTexture(
  name: string,
  spec: BuildingFacadeSpec,
): THREE.DataTexture {
  const generated = generateBuildingFacadeTextureData(spec);
  const texture = new THREE.DataTexture(
    generated.data,
    generated.width,
    generated.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// These textures are renderer-lifetime resources. Building meshes reuse them;
// individual mesh unmounts must never dispose a shared façade texture.
export const HOUSE_FACADE_TEXTURE = createFacadeTexture('HouseFacadeTexture', HOUSE_FACADE_SPEC);
export const HOTEL_FACADE_TEXTURE = createFacadeTexture('HotelFacadeTexture', HOTEL_FACADE_SPEC);
