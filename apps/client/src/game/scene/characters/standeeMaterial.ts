import * as THREE from 'three';
import { CAMERA_DIRECTION } from '../camera/cameraMath';
import { CHARACTER_BILLBOARD_HEIGHT } from '../board/architecture/tileAnchors';

/**
 * The mascot standee (plan 05 §8.4): the mascot art printed on a die-cut card that stands on a round base, in place of the
 * camera-facing sprite. These are the shared constants and materials of its face; the base is `StandeeBases`.
 */

/** Heading of the standee: it faces the camera's azimuth only (never its elevation), so it is a vertical card. */
export const STANDEE_HEADING_Y = Math.atan2(CAMERA_DIRECTION[0], CAMERA_DIRECTION[2]);

/** A vertical card is foreshortened by the cosine of the camera elevation (about 0.749 at 41.5 degrees). */
export const STANDEE_FORESHORTENING = Math.hypot(CAMERA_DIRECTION[0], CAMERA_DIRECTION[2])
  / Math.hypot(CAMERA_DIRECTION[0], CAMERA_DIRECTION[1], CAMERA_DIRECTION[2]);

/** Height of the base disc; the card stands on top of it. */
export const STANDEE_BASE_HEIGHT = 0.05;
export const STANDEE_BASE_RADIUS = 0.3;

/**
 * Raster size of the baked texture and of the mascot art inside it. The art keeps its 256 px; the rest is margin for the
 * white die-cut border, so the plane is larger than the sprite by this ratio.
 */
export const STANDEE_TEXTURE_SIZE = 320;
export const STANDEE_ART_SIZE = 256;
export const STANDEE_BORDER_PX = 6;
export const STANDEE_TEXTURE_RATIO = STANDEE_TEXTURE_SIZE / STANDEE_ART_SIZE;

/** Width of the art as the old sprite drew it, before the border margin. */
export const STANDEE_ART_WIDTH = 0.96;

/** World height of the art so that its height on screen equals the old sprite's (`1.22`). */
export const STANDEE_ART_HEIGHT = CHARACTER_BILLBOARD_HEIGHT / STANDEE_FORESHORTENING;

export interface StandeeFaceSize {
  width: number;
  height: number;
}

/** Width and height of the whole card, border margin included, for a mascot with the registry `scale`. */
export function getStandeeFaceSize(scale: number): StandeeFaceSize {
  return {
    width: STANDEE_ART_WIDTH * scale * STANDEE_TEXTURE_RATIO,
    height: STANDEE_ART_HEIGHT * scale * STANDEE_TEXTURE_RATIO,
  };
}

/**
 * Y of the middle of the card in the body group. The art's lower edge sits on the base disc; the border margin below the art
 * is transparent, so the card is centered on the art plus the vertical offset of the registry entry.
 */
export function getStandeeFaceCenterY(scale: number, verticalOffset: number): number {
  return STANDEE_BASE_HEIGHT + (STANDEE_ART_HEIGHT * scale) / 2 + verticalOffset;
}

/**
 * Unlit like the sprite it replaces (`toneMapped: false`), so a mascot reads exactly as bright as before; a lit material would
 * put the camera-facing card in shade. Opaque with an alpha test: the border and the mascot are a hard silhouette.
 */
export function getStandeeFaceMaterialProps(texture: THREE.Texture): {
  map: THREE.Texture;
  alphaTest: number;
  transparent: false;
  toneMapped: false;
  side: THREE.Side;
} {
  return { map: texture, alphaTest: 0.5, transparent: false, toneMapped: false, side: THREE.FrontSide };
}

/** Lets the card cast a shadow with the silhouette of the mascot instead of a rectangle. */
export function createStandeeDepthMaterial(texture: THREE.Texture): THREE.MeshDepthMaterial {
  return new THREE.MeshDepthMaterial({ map: texture, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
}
