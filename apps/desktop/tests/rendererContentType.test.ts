import { describe, expect, it } from 'vitest';
import { contentType } from '../src/rendererContentType';

describe('packaged renderer content types', () => {
  it('serves every font format emitted by the production renderer', () => {
    expect(contentType('BeVietnamPro-ExtraBold-DczkUabF.ttf')).toBe('font/ttf');
    expect(contentType('be-vietnam-pro-latin-800-normal-BpHZASpI.woff2')).toBe('font/woff2');
    expect(contentType('be-vietnam-pro-latin-800-normal-Cwp5p0gU.woff')).toBe('font/woff');
  });

  it('keeps existing renderer mappings and safely handles unknown files', () => {
    expect(contentType('index.html')).toBe('text/html; charset=utf-8');
    expect(contentType('index.js')).toBe('text/javascript; charset=utf-8');
    expect(contentType('index.css')).toBe('text/css; charset=utf-8');
    expect(contentType('data.json')).toBe('application/json; charset=utf-8');
    expect(contentType('icon.svg')).toBe('image/svg+xml');
    expect(contentType('image.png')).toBe('image/png');
    expect(contentType('image.jpg')).toBe('image/jpeg');
    expect(contentType('image.jpeg')).toBe('image/jpeg');
    expect(contentType('image.gif')).toBe('image/gif');
    expect(contentType('favicon.ico')).toBe('image/x-icon');
    expect(contentType('asset.bin')).toBe('application/octet-stream');
  });
});
