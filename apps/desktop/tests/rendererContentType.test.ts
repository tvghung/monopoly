import { describe, expect, it } from 'vitest';
import { contentType, PRODUCTION_RENDERER_CSP } from '../src/rendererContentType';

describe('packaged renderer content types', () => {
  it('permits only the trusted worker and font sources required by bundled SDF text', () => {
    expect(PRODUCTION_RENDERER_CSP).toBe(
      "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:;",
    );
  });

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
    expect(contentType('gameplay-foundation.ogg')).toBe('audio/ogg');
    expect(contentType('asset.bin')).toBe('application/octet-stream');
  });
});
