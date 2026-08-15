import type { Tile } from '@monopoly/shared';
import * as THREE from 'three';
import { formatMoney, getTileName } from '../../../presentation';
import {
  getPropertyGroupVisualStyle,
  type PropertyMotif,
} from '../../ui/propertyVisualColors';
import { boardVisualTokens } from './boardVisualTokens';

const TILE_TEXTURE_ANISOTROPY = 4;

interface TileSurfaceStyle {
  accent: string;
  tint: string;
  motif: PropertyMotif;
}

const SPECIAL_TILE_STYLES: Record<string, TileSurfaceStyle> = {
  jail: { accent: boardVisualTokens.jail, tint: '#eeeafd', motif: 'downtown' },
  gojail: { accent: boardVisualTokens.expense, tint: '#ffe7e7', motif: 'downtown' },
  chance: { accent: boardVisualTokens.chance, tint: '#fff0da', motif: 'shopping' },
  chest: { accent: boardVisualTokens.chest, tint: '#def8f3', motif: 'water' },
  railroad: { accent: boardVisualTokens.railroad, tint: '#edf2f6', motif: 'rail' },
  company: { accent: boardVisualTokens.utility, tint: '#e5f1ff', motif: 'water' },
  expense: { accent: boardVisualTokens.expense, tint: '#ffe7e7', motif: 'downtown' },
  start: { accent: boardVisualTokens.selection, tint: '#fff7d6', motif: 'nightlife' },
  parking: { accent: boardVisualTokens.plazaTree, tint: '#e5f6e6', motif: 'eco' },
};

interface TextureCacheEntry {
  texture: THREE.CanvasTexture;
  users: number;
  disposalToken: number;
}

const textureCache = new Map<number, TextureCacheEntry>();

function labelDimensions(tile: Tile): { width: number; height: number } {
  return tile.tileType === 'start'
    || tile.tileType === 'jail'
    || tile.tileType === 'parking'
    || tile.tileType === 'gojail'
    ? { width: 512, height: 512 }
    : { width: 384, height: 640 };
}

export function getTileSurfaceStyle(tile: Tile): TileSurfaceStyle {
  if (tile.color) {
    const style = getPropertyGroupVisualStyle(tile.color);
    return { accent: style.color, tint: style.tint, motif: style.motif };
  }
  return SPECIAL_TILE_STYLES[tile.tileType] ?? {
    accent: boardVisualTokens.boardBase,
    tint: boardVisualTokens.tileSurface,
    motif: 'water',
  };
}

function tileTypeLabel(tile: Tile): string {
  switch (tile.tileType) {
    case 'normal': return 'BẤT ĐỘNG SẢN';
    case 'railroad': return 'GA TÀU';
    case 'company': return 'CÔNG TY';
    case 'chance': return 'CƠ HỘI';
    case 'chest': return 'KHÍ VẬN';
    case 'jail': return 'NHÀ TÙ';
    case 'gojail': return 'VÀO TÙ';
    case 'parking': return 'BÃI ĐỖ XE';
    case 'expense': return 'THUẾ / PHÍ';
    case 'start': return 'ĐIỂM KHỞI ĐẦU';
  }
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((entry, index) => {
    context.fillText(entry, centerX, startY + index * lineHeight);
  });
}

function drawMotif(
  context: CanvasRenderingContext2D,
  motif: PropertyMotif,
  accent: string,
  width: number,
  height: number,
): void {
  const startY = Math.round(height * 0.58);
  const unit = Math.max(8, Math.round(width * 0.06));
  context.globalAlpha = 0.15;
  context.fillStyle = accent;
  switch (motif) {
    case 'brick':
      for (let row = 0; row < 3; row += 1) {
        for (let column = row % 2; column < 8; column += 2) {
          context.fillRect(column * unit, startY + row * unit, unit * 0.8, unit * 0.48);
        }
      }
      break;
    case 'water':
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 6; column += 1) {
          context.fillRect(column * unit * 1.35, startY + row * unit, unit, unit * 0.12);
        }
      }
      break;
    case 'shopping':
    case 'nightlife':
    case 'luxury':
      for (let index = 0; index < 5; index += 1) {
        const x = (index * 2 + 1) * unit;
        const y = startY + (index % 2) * unit * 1.4;
        context.fillRect(x, y, unit * 0.34, unit * 0.34);
        context.fillRect(x - unit * 0.34, y + unit * 0.34, unit * 1.02, unit * 0.18);
      }
      break;
    case 'market':
    case 'eco':
      for (let index = 0; index < 8; index += 1) {
        context.fillRect(
          (index % 4) * unit * 1.5 + unit * 0.35,
          startY + Math.floor(index / 4) * unit * 1.5,
          unit * 0.4,
          unit * 0.4,
        );
      }
      break;
    case 'downtown':
      for (let index = 0; index < 5; index += 1) {
        context.fillRect(index * unit * 1.4, startY, unit * 0.7, unit * (1 + (index % 2) * 0.5));
      }
      break;
    case 'rail':
      context.fillRect(0, startY, width * 0.82, unit * 0.12);
      context.fillRect(0, startY + unit * 0.75, width * 0.82, unit * 0.12);
      for (let index = 0; index < 7; index += 1) {
        context.fillRect(index * unit * 1.25, startY - unit * 0.15, unit * 0.12, unit * 1.2);
      }
      break;
  }
  context.globalAlpha = 1;
}

function createTileLabelTexture(tileId: number, tile: Tile): THREE.CanvasTexture {
  const { width, height } = labelDimensions(tile);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không thể tạo canvas cho nhãn ô cờ.');

  const style = getTileSurfaceStyle(tile);
  const accentHeight = Math.round(height * 0.2);
  context.fillStyle = style.tint;
  context.fillRect(0, 0, width, height);
  drawMotif(context, style.motif, style.accent, width, height);
  context.fillStyle = style.accent;
  context.fillRect(0, 0, width, accentHeight);
  context.strokeStyle = boardVisualTokens.tileBorder;
  context.lineWidth = Math.max(3, Math.round(width * 0.012));
  context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, width - context.lineWidth, height - context.lineWidth);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = boardVisualTokens.tileText;
  context.font = `800 ${Math.round(width * 0.07)}px Arial, sans-serif`;
  context.fillText(tileTypeLabel(tile), width / 2, height * 0.25);

  context.font = `800 ${Math.round(width * 0.115)}px Arial, sans-serif`;
  drawWrappedText(context, getTileName(tileId), width / 2, height * 0.46, width * 0.82, width * 0.13, 3);

  if (typeof tile.price === 'number') {
    context.font = `800 ${Math.round(width * 0.072)}px Arial, sans-serif`;
    context.fillText(formatMoney(tile.price), width / 2, height * 0.86);
  } else {
    context.font = `700 ${Math.round(width * 0.06)}px Arial, sans-serif`;
    context.fillStyle = boardVisualTokens.tileText;
    context.fillText('MỞ CHI TIẾT', width / 2, height * 0.86);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = TILE_TEXTURE_ANISOTROPY;
  texture.needsUpdate = true;
  return texture;
}

export function acquireTileLabelTexture(tileId: number, tile: Tile): THREE.CanvasTexture {
  const cached = textureCache.get(tileId);
  if (cached) {
    cached.users += 1;
    cached.disposalToken += 1;
    return cached.texture;
  }
  const entry: TextureCacheEntry = {
    texture: createTileLabelTexture(tileId, tile),
    users: 1,
    disposalToken: 0,
  };
  textureCache.set(tileId, entry);
  return entry.texture;
}

export function releaseTileLabelTexture(tileId: number): void {
  const cached = textureCache.get(tileId);
  if (!cached || cached.users === 0) return;
  cached.users -= 1;
  if (cached.users > 0) return;
  const disposalToken = ++cached.disposalToken;
  queueMicrotask(() => {
    const current = textureCache.get(tileId);
    if (current !== cached || current.users > 0 || current.disposalToken !== disposalToken) return;
    current.texture.dispose();
    textureCache.delete(tileId);
  });
}
