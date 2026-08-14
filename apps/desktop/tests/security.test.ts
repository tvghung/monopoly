import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isAllowedRendererNavigation,
  isSafeExternalUrl,
  resolveRendererPath,
} from '../src/security';

describe('desktop renderer security', () => {
  it('allows only the packaged app URL and the dev Vite origin', () => {
    expect(isAllowedRendererNavigation('app://own-the-block/index.html', false)).toBe(true);
    expect(isAllowedRendererNavigation('app://other-app/index.html', false)).toBe(false);
    expect(isAllowedRendererNavigation('http://127.0.0.1:5173/', true)).toBe(true);
    expect(isAllowedRendererNavigation('http://127.0.0.1:8080/', true)).toBe(false);
    expect(isAllowedRendererNavigation('https://example.com/', true)).toBe(false);
  });

  it('validates external links and rejects credentials', () => {
    expect(isSafeExternalUrl('https://example.com/help')).toBe(true);
    expect(isSafeExternalUrl('https://user:secret@example.com/help')).toBe(false);
    expect(isSafeExternalUrl('http://localhost:3000/help')).toBe(false);
    expect(isSafeExternalUrl('http://localhost:3000/help', true)).toBe(true);
    expect(isSafeExternalUrl('javascript:alert(1)', true)).toBe(false);
  });

  it('rejects renderer path traversal and resolves a real packaged file', async () => {
    const rendererRoot = path.resolve(process.cwd(), '../client/dist');
    const indexPath = await resolveRendererPath(rendererRoot, 'app://own-the-block/index.html');
    expect(indexPath).toBe(path.join(rendererRoot, 'index.html'));
    expect(await resolveRendererPath(rendererRoot, 'app://own-the-block/%2e%2e/package.json')).toBeNull();
    expect(await resolveRendererPath(rendererRoot, 'app://other-app/index.html')).toBeNull();
  });
});
