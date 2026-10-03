import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOARD_CANVAS_CAMERA, configureOrthographicCamera } from './FixedBoardCamera';
import { getOrthographicCameraPosition } from './cameraMath';

describe('the board Canvas camera', () => {
  it('is manual, so R3F never rewrites the frustum when the pixel ratio changes with the graphics tier', () => {
    expect(BOARD_CANVAS_CAMERA.manual).toBe(true);
    expect([...BOARD_CANVAS_CAMERA.position]).toEqual([...getOrthographicCameraPosition()]);
  });

  it('gives the same frustum for the same aspect, whatever the canvas size in pixels', () => {
    const small = new THREE.OrthographicCamera();
    const large = new THREE.OrthographicCamera();

    configureOrthographicCamera(small, 1280 / 720);
    configureOrthographicCamera(large, 1920 / 1080);

    expect([small.left, small.right, small.top, small.bottom, small.zoom])
      .toEqual([large.left, large.right, large.top, large.bottom, large.zoom]);
  });
});
