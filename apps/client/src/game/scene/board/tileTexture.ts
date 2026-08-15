import type { Tile } from '@monopoly/shared';
import * as THREE from 'three';
import { formatMoney, getTileName } from '../../../presentation';
import { boardVisualTokens } from './boardVisualTokens';

const TILE_COLOR_TOKENS: Record<string, string> = {
  brown: '#9b6b45',
  lightblue: '#72c7d8',
  pink: '#d77bb6',
  orange: '#e89448',
  red: '#d45b61',
  yellow: '#e3c95d',
  green: '#65a96c',
  blue: '#5e8fd4',
  railroad: boardVisualTokens.railroad,
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

function tileAccent(tile: Tile): string {
  if (tile.color) return TILE_COLOR_TOKENS[tile.color] ?? tile.color;
  switch (tile.tileType) {
    case 'jail':
    case 'gojail':
      return boardVisualTokens.jail;
    case 'chance':
      return boardVisualTokens.chance;
    case 'chest':
      return boardVisualTokens.chest;
    case 'railroad':
      return boardVisualTokens.railroad;
    case 'company':
      return boardVisualTokens.utility;
    case 'expense':
      return boardVisualTokens.expense;
    default:
      return boardVisualTokens.boardBase;
  }
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

function createTileLabelTexture(tileId: number, tile: Tile): THREE.CanvasTexture {
  const { width, height } = labelDimensions(tile);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không thể tạo canvas cho nhãn ô cờ.');

  const accent = tileAccent(tile);
  context.fillStyle = '#fffaf0';
  context.fillRect(0, 0, width, height);
  context.fillStyle = accent;
  context.fillRect(0, 0, width, Math.round(height * 0.18));
  context.strokeStyle = '#d9cdb7';
  context.lineWidth = Math.max(3, Math.round(width * 0.012));
  context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, width - context.lineWidth, height - context.lineWidth);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = boardVisualTokens.tileText;
  context.font = `700 ${Math.round(width * 0.075)}px Arial, sans-serif`;
  context.fillText(tileTypeLabel(tile), width / 2, height * 0.25);

  context.font = `700 ${Math.round(width * 0.105)}px Arial, sans-serif`;
  drawWrappedText(context, getTileName(tileId), width / 2, height * 0.43, width * 0.82, width * 0.12, 3);

  if (typeof tile.price === 'number') {
    context.font = `700 ${Math.round(width * 0.075)}px Arial, sans-serif`;
    context.fillText(formatMoney(tile.price), width / 2, height * 0.82);
  } else {
    context.font = `600 ${Math.round(width * 0.06)}px Arial, sans-serif`;
    context.fillStyle = '#63756f';
    context.fillText('MỞ CHI TIẾT', width / 2, height * 0.82);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
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

export function getTileLabelScale(tile: Tile): readonly [number, number, number] {
  return labelDimensions(tile).width === 512
    ? [1.75, 1.75, 1]
    : [1.05, 1.72, 1];
}

export function getTileAccentColor(tile: Tile): string {
  return tileAccent(tile);
}
