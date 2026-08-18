declare module 'troika-three-text' {
  import { Mesh } from 'three';

  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    maxWidth: number;
    maxHeight: number;
    anchorX: number | string;
    anchorY: number | string;
    textAlign: string;
    lineHeight: number | string;
    color: string | number;
    sdfGlyphSize: number;
    sync: (callback?: () => void) => void;
    dispose: () => void;
  }
}
