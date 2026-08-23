import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Text } from 'troika-three-text';
import type { WorldAnchor } from '../../stations/stationWorld';
import { configureSdfText, TILE_SDF_GLYPH_SIZE } from './sdfTextConfig';
import { FIXED_CAMERA_QUATERNION } from '../../camera/fixedCameraOrientation';

interface SdfBillboardTextProps {
  value: string;
  position: WorldAnchor;
  fontSize: number;
  maxWidth: number;
  color: string;
  outlineColor?: string | number;
  outlineWidth?: number | string;
  outlineOpacity?: number;
  lineHeight?: number;
  sdfGlyphSize?: number;
  name?: string;
}

export default function SdfBillboardText({
  value,
  position,
  fontSize,
  maxWidth,
  color,
  outlineColor,
  outlineWidth,
  outlineOpacity,
  lineHeight = 1.05,
  sdfGlyphSize = TILE_SDF_GLYPH_SIZE,
  name,
}: SdfBillboardTextProps) {
  const invalidate = useThree(state => state.invalidate);
  const textObjectRef = useRef<Text | null>(null);
  if (!textObjectRef.current) textObjectRef.current = new Text();
  const textObject = textObjectRef.current;
  const disposeGeneration = useRef(0);

  useEffect(() => {
    configureSdfText(textObject, {
      value,
      fontSize,
      maxWidth,
      color,
      outlineColor,
      outlineWidth,
      outlineOpacity,
      lineHeight,
      sdfGlyphSize,
    }, invalidate);
  }, [color, fontSize, invalidate, lineHeight, maxWidth, outlineColor, outlineOpacity, outlineWidth, sdfGlyphSize, textObject, value]);

  useLayoutEffect(() => {
    textObject.position.set(...position);
    textObject.quaternion.copy(FIXED_CAMERA_QUATERNION);
    invalidate();
  }, [invalidate, position, textObject]);

  useEffect(() => {
    const generation = disposeGeneration.current + 1;
    disposeGeneration.current = generation;
    return () => {
      queueMicrotask(() => {
        if (disposeGeneration.current === generation) textObject.dispose();
      });
    };
  }, [textObject]);

  return <primitive object={textObject} name={name} />;
}
