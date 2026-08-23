import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HOUSE_BODY_DEPTH,
  HOUSE_BODY_HEIGHT,
  HOUSE_BODY_WIDTH,
  HOUSE_ROOF_DEPTH,
  HOUSE_ROOF_HEIGHT,
  HOUSE_ROOF_WIDTH,
  HOTEL_BODY_DEPTH,
  HOTEL_BODY_HEIGHT,
  HOTEL_BODY_WIDTH,
  HOTEL_CROWN_DEPTH,
  HOTEL_CROWN_HEIGHT,
  HOTEL_CROWN_WIDTH,
} from '../board/architecture/boardArtSpec';
import { getBuildingSlots, getHotelSlot, TILE_SURFACE_Y } from '../board/architecture/tileAnchors';
import { boardMaterialSpecs } from '../board/materials/boardMaterialSpecs';
import { boardVisualTokens } from '../board/boardVisualTokens';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import {
  BUILDING_FACADE_TEXTURE_SIZE,
  FACADE_WINDOW_FRAME_COLOR,
  FACADE_WINDOW_PANE_COLOR,
  generateBuildingFacadeTextureData,
  getFacadePaneRegions,
  HOUSE_FACADE_SPEC,
  HOUSE_FACADE_TEXTURE,
  HOUSE_FACADE_WALL_COLOR,
  HOTEL_FACADE_SPEC,
  HOTEL_FACADE_TEXTURE,
  HOTEL_FACADE_WALL_COLOR,
} from './buildingFacadeTextures';
import { getHouseRoofColor, getHouseWallColor } from './HouseMesh';
import { createPitchedRoofGeometry } from './houseRoofGeometry';
import { getHotelCrownColor, getHotelFacadeColor } from './HotelMesh';

function parseHexColor(value: string): readonly [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function getPixel(data: Uint8Array, size: number, x: number, y: number): readonly number[] {
  const index = (y * size + x) * 4;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function sampleRegion(
  data: Uint8Array,
  size: number,
  region: { x: number; y: number; width: number; height: number },
): readonly number[] {
  return getPixel(
    data,
    size,
    Math.floor(region.x + region.width / 2),
    Math.floor(region.y + region.height / 2),
  );
}

describe('authored house and hotel visual contract', () => {
  it('uses neutral matte facade materials and canonical owner colors only on the roof or crown', () => {
    expect(getHouseWallColor()).toBe(HOUSE_FACADE_WALL_COLOR);
    expect(getHouseRoofColor('red')).toBe(getPlayerDisplayColor('red'));
    expect(getHouseRoofColor('red')).not.toBe(boardVisualTokens.houseDark);
    expect(getHouseRoofColor(undefined)).toBe(boardVisualTokens.houseDark);
    expect(getHouseWallColor()).not.toBe(getPlayerDisplayColor('red'));

    expect(getHotelFacadeColor()).toBe(HOTEL_FACADE_WALL_COLOR);
    expect(getHotelCrownColor('blue')).toBe(getPlayerDisplayColor('blue'));
    expect(getHotelCrownColor('blue')).not.toBe(boardVisualTokens.hotelDark);
    expect(getHotelCrownColor(undefined)).toBe(boardVisualTokens.hotelDark);
    expect(getHotelFacadeColor()).not.toBe(getPlayerDisplayColor('blue'));

    expect(boardMaterialSpecs.houseWall).toEqual({ roughness: 0.76, metalness: 0 });
    expect(boardMaterialSpecs.hotel).toEqual({ roughness: 0.68, metalness: 0 });
    expect(boardMaterialSpecs.houseRoof).toEqual({ roughness: 0.48, metalness: 0 });
  });

  it('keeps the exact house 2-column by 1-row four-pane facade contract', () => {
    const generated = generateBuildingFacadeTextureData(HOUSE_FACADE_SPEC);
    const paneColor = [...parseHexColor(FACADE_WINDOW_PANE_COLOR), 255];
    const frameColor = [...parseHexColor(FACADE_WINDOW_FRAME_COLOR), 255];
    expect(HOUSE_FACADE_SPEC).toMatchObject({ columns: 2, rows: 1 });
    expect(generated.windows).toHaveLength(2);
    expect(generated.panes).toHaveLength(2 * 1 * 4);
    generated.panes.forEach(pane => {
      expect(sampleRegion(generated.data, generated.width, pane)).toEqual(paneColor);
    });
    const firstWindow = generated.windows[0];
    const left = Math.round(firstWindow.x * generated.width);
    const top = Math.round(firstWindow.y * generated.height);
    expect(getPixel(generated.data, generated.width, left + 1, top + 1)).toEqual(frameColor);
    const panes = getFacadePaneRegions(HOUSE_FACADE_SPEC);
    const verticalMuntinX = Math.floor(
      panes[0].x + panes[0].width + HOUSE_FACADE_SPEC.muntinPixels / 2,
    );
    const horizontalMuntinY = Math.floor(
      panes[0].y + panes[0].height + HOUSE_FACADE_SPEC.muntinPixels / 2,
    );
    expect(getPixel(generated.data, generated.width, verticalMuntinX, Math.floor(panes[0].y)))
      .toEqual(frameColor);
    expect(getPixel(generated.data, generated.width, Math.floor(panes[0].x), horizontalMuntinY))
      .toEqual(frameColor);
  });

  it('keeps the exact hotel 2-column by 3-row multi-storey four-pane facade contract', () => {
    const generated = generateBuildingFacadeTextureData(HOTEL_FACADE_SPEC);
    const paneColor = [...parseHexColor(FACADE_WINDOW_PANE_COLOR), 255];
    expect(HOTEL_FACADE_SPEC).toMatchObject({ columns: 2, rows: 3 });
    expect(generated.windows).toHaveLength(2 * 3);
    expect(generated.panes).toHaveLength(2 * 3 * 4);
    expect(generated.panes.every(pane => sampleRegion(generated.data, generated.width, pane).join(',') === paneColor.join(',')))
      .toBe(true);
    expect(new Set(generated.windows.map(window => window.row))).toEqual(new Set([0, 1, 2]));
  });

  it('creates shared opaque sRGB textures with mipmapped clamped sampling', () => {
    expect(HOUSE_FACADE_TEXTURE).toBe(HOUSE_FACADE_TEXTURE);
    expect(HOTEL_FACADE_TEXTURE).toBe(HOTEL_FACADE_TEXTURE);
    expect(HOUSE_FACADE_TEXTURE).not.toBe(HOTEL_FACADE_TEXTURE);
    [HOUSE_FACADE_TEXTURE, HOTEL_FACADE_TEXTURE].forEach(texture => {
      expect(texture).toBeInstanceOf(THREE.DataTexture);
      expect(texture.image.width).toBe(BUILDING_FACADE_TEXTURE_SIZE);
      expect(texture.image.height).toBe(BUILDING_FACADE_TEXTURE_SIZE);
      expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
      expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
      expect(texture.magFilter).toBe(THREE.LinearFilter);
      expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.image.data).toBeInstanceOf(Uint8Array);
      if (!texture.image.data) {
        throw new Error('Generated facade texture is missing its pixel data');
      }
      for (let index = 3; index < texture.image.data.length; index += 4) {
        expect(texture.image.data[index]).toBe(255);
      }
    });
  });

  it('preserves body dimensions, roof/crown footprints, slots, and tile anchors', () => {
    expect([HOUSE_BODY_WIDTH, HOUSE_BODY_DEPTH, HOUSE_BODY_HEIGHT]).toEqual([0.48, 0.39, 0.36]);
    expect([HOUSE_ROOF_WIDTH, HOUSE_ROOF_DEPTH, HOUSE_ROOF_HEIGHT]).toEqual([0.56, 0.47, 0.18]);
    expect([HOTEL_BODY_WIDTH, HOTEL_BODY_DEPTH, HOTEL_BODY_HEIGHT]).toEqual([0.92, 0.6, 0.78]);
    expect([HOTEL_CROWN_WIDTH, HOTEL_CROWN_DEPTH, HOTEL_CROWN_HEIGHT]).toEqual([1.04, 0.7, 0.15]);
    expect(getBuildingSlots(4)).toHaveLength(4);
    expect(getBuildingSlots(4).every(position => (
      position[1] - HOUSE_BODY_HEIGHT / 2 === TILE_SURFACE_Y + 0.008
    ))).toBe(true);
    expect(getHotelSlot()[1] - HOTEL_BODY_HEIGHT / 2).toBeCloseTo(TILE_SURFACE_Y + 0.008);
  });

  it('uses one pitched roof geometry with the requested footprint and rise', () => {
    const geometry = createPitchedRoofGeometry(HOUSE_ROOF_WIDTH, HOUSE_ROOF_DEPTH, HOUSE_ROOF_HEIGHT);
    expect(geometry.getAttribute('position').count).toBe(24);
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-HOUSE_ROOF_WIDTH / 2);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0);
    expect(geometry.boundingBox?.min.z).toBeCloseTo(-HOUSE_ROOF_DEPTH / 2);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(HOUSE_ROOF_WIDTH / 2);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(HOUSE_ROOF_HEIGHT);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(HOUSE_ROOF_DEPTH / 2);
    geometry.dispose();
  });
});
