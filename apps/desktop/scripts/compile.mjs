import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(desktopRoot, 'src');
const outputRoot = path.join(desktopRoot, 'dist');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const typeScript = spawnSync(pnpm, ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
  cwd: desktopRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (typeScript.status !== 0) process.exit(typeScript.status ?? 1);

await build({
  entryPoints: [path.join(sourceRoot, 'preload.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  outfile: path.join(outputRoot, 'preload.js'),
  sourcemap: true,
  legalComments: 'none',
});

for (const file of ['main.js', 'preload.js']) {
  await access(path.join(outputRoot, file));
}
