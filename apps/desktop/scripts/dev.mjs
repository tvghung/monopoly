import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(desktopRoot, '../..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const children = [];
let shuttingDown = false;

const compile = spawnSync(pnpm, ['run', 'compile'], {
  cwd: desktopRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (compile.status !== 0) process.exit(compile.status ?? 1);

function start(args) {
  const child = spawn(pnpm, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: process.platform === 'win32',
  });
  children.push(child);
  return child;
}

async function waitForRenderer(url, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The Vite process is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Renderer did not become available at ${url}.`);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const server = start(['--filter', '@monopoly/server', 'dev']);
const client = start(['--filter', '@monopoly/client', 'dev', '--', '--host', '127.0.0.1']);
server.on('error', () => shutdown(1));
client.on('error', () => shutdown(1));

try {
  await waitForRenderer('http://127.0.0.1:5173');
  const desktop = spawn(electronBinary, [desktopRoot], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_IS_DEV: '1' },
  });
  children.push(desktop);
  desktop.on('exit', code => shutdown(code ?? 0));
  desktop.on('error', () => shutdown(1));
} catch (error) {
  console.error(error);
  shutdown(1);
}
