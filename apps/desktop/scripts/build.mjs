import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const run = (args) => {
  const result = spawnSync(pnpm, args, { cwd: desktopRoot, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(['run', 'prepare:renderer']);
run(['run', 'compile']);

