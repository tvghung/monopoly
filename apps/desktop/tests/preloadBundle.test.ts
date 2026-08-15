import path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('Electron preload bundle', () => {
  it('bundles local bridge modules while keeping Electron external', async () => {
    const result = await build({
      entryPoints: [path.resolve(process.cwd(), 'src/preload.ts')],
      absWorkingDir: process.cwd(),
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      external: ['electron'],
      write: false,
    });
    const output = result.outputFiles?.[0]?.text ?? '';

    expect(output).toContain('contextBridge.exposeInMainWorld');
    expect(output).toContain('require("electron")');
    expect(output).not.toContain('./ipc/channels');
    expect(output).not.toContain('./runtimeConfig');
  });
});
