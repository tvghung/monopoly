import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const require = createRequire(import.meta.url);
const electronBinary = require('electron');

const compile = spawnSync(pnpm, ['run', 'compile'], {
  cwd: desktopRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (compile.status !== 0) process.exit(compile.status ?? 1);

const desktop = spawn(electronBinary, [desktopRoot], {
  cwd: desktopRoot,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_IS_DEV: '1' },
});

const stop = () => {
  if (!desktop.killed) desktop.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
desktop.on('error', error => {
  console.error('Own the Block desktop shell failed to start.', error);
  process.exitCode = 1;
});
desktop.on('exit', code => {
  process.exit(code ?? 0);
});
