/**
 * Physical art dimensions shared by the board renderer.
 *
 * Board layout owns canonical positions and rotations. This module owns the
 * thickness, bevel, clearance, and presentation dimensions used to build the
 * physical board around that layout.
 */
export const BOARD_FOUNDATION_HEIGHT = 0.42;
export const BOARD_FOUNDATION_BEVEL = 0.16;
export const BOARD_LOWER_CHASSIS_HEIGHT = 0.16;
export const BOARD_TOP_DECK_HEIGHT = 0.12;
export const BOARD_FRAME_HEIGHT = 0.07;
export const BOARD_FRAME_BEVEL = 0.025;
export const BOARD_FRAME_WIDTH = 0.12;
export const BOARD_CENTER_INSET = 0.14;

export const TILE_BODY_HEIGHT = 0.3;
export const TILE_BODY_BEVEL = 0.075;
export const TILE_SOCKET_DEPTH = 0.085;
export const TILE_SOCKET_BEVEL = 0.045;
export const TILE_SOCKET_LIP_HEIGHT = 0.015;
export const TILE_SOCKET_GAP = 0.025;
export const TILE_SURFACE_EPSILON = 0.008;
export const TILE_SURFACE_INSET = 0.08;
/** Shared shallow badge elevation for approved SVG-backed special-tile art. */
export const TILE_ICON_DEPTH = 0.018;
export const TILE_ICON_BACKING_Y_OFFSET = TILE_SURFACE_EPSILON + 0.006;
export const TILE_ICON_FACE_Y_OFFSET = TILE_ICON_BACKING_Y_OFFSET + TILE_ICON_DEPTH;
export const TILE_ICON_BACKING_SCALE = 1.018;

export const PROPERTY_TEXT_Y = BOARD_FOUNDATION_HEIGHT + TILE_SOCKET_GAP
  + TILE_BODY_HEIGHT + TILE_SURFACE_EPSILON + 0.006;
export const PROPERTY_NAME_Y = PROPERTY_TEXT_Y + 0.002;

export const TILE_STEP_PRESS_DEPTH = 0.036;
export const TILE_LAND_PRESS_DEPTH = 0.058;

export const HOUSE_BODY_HEIGHT = 0.32;
export const HOTEL_BODY_HEIGHT = 0.68;
export const PLAYER_MARKER_BODY_HEIGHT = 0.26;

export const CENTER_AIRPORT_SURFACE_Y = BOARD_FOUNDATION_HEIGHT + 0.045;
export const CENTER_AIRPORT_FIELD_HEIGHT = 0.08;
export const CENTER_AIRPORT_FIELD_TOP_Y = CENTER_AIRPORT_SURFACE_Y + CENTER_AIRPORT_FIELD_HEIGHT;
export const CONTACT_SHADOW_Y = 0.004;

export const OWNERSHIP_MARKER_HEIGHT = 0.065;
export const SELECTION_EDGE_HEIGHT = 0.045;
export const CARD_HEIGHT = 0.07;
export const JAIL_BASE_HEIGHT = 0.1;
