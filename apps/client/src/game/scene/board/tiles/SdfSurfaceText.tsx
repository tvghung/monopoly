import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Text } from 'troika-three-text';
import type * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import { configureSdfText, TILE_SDF_GLYPH_SIZE } from './sdfTextConfig';

export interface SdfSurfaceTextProps {
  value: string;
  position: readonly [number, number, number];
  fontSize: number;
  maxWidth: number;
  maxHeight?: number;
  color?: string;
  lineHeight?: number;
  sdfGlyphSize?: number;
  rotationX?: number;
  rotationZ?: number;
  renderOrder?: number;
  name?: string;
}

export function limitSurfaceTextLines(value: string, maxLines = 3, maxWordsPerLine = 3): string {
  if (value.includes('\n')) {
    return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, maxLines).join('\n');
  }
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWordsPerLine * maxLines) return words.join(' ');
  return `${words.slice(0, maxWordsPerLine * maxLines - 1).join(' ')}…`;
}

export default function SdfSurfaceText({
  value,
  position,
  fontSize,
  maxWidth,
  maxHeight,
  color = boardVisualTokens.tileText,
  lineHeight = 1.05,
  sdfGlyphSize = TILE_SDF_GLYPH_SIZE,
  rotationX = -Math.PI / 2,
  rotationZ = 0,
  renderOrder = 0,
  name,
}: SdfSurfaceTextProps) {
  const invalidate = useThree(state => state.invalidate);
  const textObjectRef = useRef<Text | null>(null);
  if (!textObjectRef.current) textObjectRef.current = new Text();
  const textObject = textObjectRef.current;
  textObject.renderOrder = renderOrder;
  const disposeGeneration = useRef(0);
  const textRef = useRef<THREE.Object3D>(null);

  useEffect(() => {
    configureSdfText(textObject, {
      value,
      fontSize,
      maxWidth,
      maxHeight,
      color,
      lineHeight,
      sdfGlyphSize,
    }, invalidate);
  }, [color, fontSize, invalidate, lineHeight, maxHeight, maxWidth, sdfGlyphSize, textObject, value]);

  useEffect(() => {
    const generation = disposeGeneration.current + 1;
    disposeGeneration.current = generation;
    return () => {
      queueMicrotask(() => {
        if (disposeGeneration.current === generation) textObject.dispose();
      });
    };
  }, [textObject]);

  return (
    <primitive
      ref={textRef}
      object={textObject}
      name={name}
      position={position}
      rotation={[rotationX, 0, rotationZ]}
    />
  );
}
