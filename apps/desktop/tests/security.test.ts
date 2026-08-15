import os from 'node:os';
import path from 'node:path';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  isAllowedRendererNavigation,
  isSafeExternalUrl,
  resolveRendererPath,
} from '../src/security';

describe('desktop renderer security', () => {
  let sandboxRoot = '';
  let rendererRoot = '';

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(
      path.join(os.tmpdir(), 'own-the-block-security-'),
    );
    rendererRoot = path.join(sandboxRoot, 'renderer');

    await mkdir(rendererRoot, { recursive: true });
    await writeFile(
      path.join(rendererRoot, 'index.html'),
      '<!doctype html><title>Own the Block</title>',
      'utf8',
    );
    await writeFile(
      path.join(sandboxRoot, 'outside.txt'),
      'outside renderer root',
      'utf8',
    );
  });

  afterEach(async () => {
    if (!sandboxRoot) return;
    await rm(sandboxRoot, { recursive: true, force: true });
    sandboxRoot = '';
    rendererRoot = '';
  });

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

  it('resolves a real file in the packaged renderer root', async () => {
    await expect(
      resolveRendererPath(rendererRoot, 'app://own-the-block/index.html'),
    ).resolves.toBe(path.join(rendererRoot, 'index.html'));
  });

  it('rejects a renderer URL with the wrong application host', async () => {
    expect(await resolveRendererPath(rendererRoot, 'app://other-app/index.html')).toBeNull();
  });

  it('rejects encoded path traversal even when the outside file exists', async () => {
    expect(
      await resolveRendererPath(rendererRoot, 'app://own-the-block/%2e%2e%2Foutside.txt'),
    ).toBeNull();
  });

  it('rejects an allowed-host URL for a missing renderer file', async () => {
    expect(
      await resolveRendererPath(rendererRoot, 'app://own-the-block/not-found.js'),
    ).toBeNull();
  });

  it('rejects an encoded null byte', async () => {
    expect(await resolveRendererPath(rendererRoot, 'app://own-the-block/%00')).toBeNull();
  });
});
