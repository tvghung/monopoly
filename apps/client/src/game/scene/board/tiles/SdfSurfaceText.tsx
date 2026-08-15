import { useEffect, useRef } from 'react';
import { Text } from 'troika-three-text';
import type * as THREE from 'three';
import { boardVisualTokens } from '../boardVisualTokens';
import { configureSdfText, TILE_SDF_GLYPH_SIZE } from './sdfTextConfig';

export interface SdfSurfaceTextProps {
  value: string;
  position: readonly [number, number, number];
  fontSize: number;
  maxWidth: number;
  color?: string;
  lineHeight?: number;
  sdfGlyphSize?: number;
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
  color = boardVisualTokens.tileText,
  lineHeight = 1.05,
  sdfGlyphSize = TILE_SDF_GLYPH_SIZE,
  name,
}: SdfSurfaceTextProps) {
  const textObjectRef = useRef<Text | null>(null);
  if (!textObjectRef.current) textObjectRef.current = new Text();
  const textObject = textObjectRef.current;
  const disposeGeneration = useRef(0);
  const textRef = useRef<THREE.Object3D>(null);

  useEffect(() => {
    configureSdfText(textObject, {
      value,
      fontSize,
      maxWidth,
      color,
      lineHeight,
      sdfGlyphSize,
    });
  }, [color, fontSize, lineHeight, maxWidth, sdfGlyphSize, textObject, value]);

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
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}
