import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Direct installed Vitest API: no pnpm invocation, installation or global opt-in environment flag.
process.env.pnpm_config_verify_deps_before_run = 'error';
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const allowedFlags = ['--mode', '--finding'];
if (args.length % 2 || args.some((arg, index) => index % 2 === 0 && !allowedFlags.includes(arg))) {
  throw new Error('Usage: node scripts/tests/runPhaseE1.mjs --mode characterization|regression --finding all|019|001|003|004');
}
const flags = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, index) => [args[index * 2], args[index * 2 + 1]]));
const mode = flags['--mode'];
const finding = flags['--finding'] ?? 'all';
if (!['characterization', 'regression'].includes(mode) || !['all', '019', '001', '003', '004'].includes(finding)) {
  throw new Error('Choose --mode characterization|regression and --finding all|019|001|003|004');
}
const targets = [
  { id: '019', workspace: 'server', file: 'audit019.e1.ts' },
  { id: '001', workspace: 'server', file: 'audit001Presence.e1.ts', report: '001-server' },
  { id: '001', workspace: 'client', file: 'audit001.e1.tsx' },
  { id: '003', workspace: 'desktop', file: 'audit003.e1.ts' },
  { id: '004', workspace: 'desktop', file: 'audit004.e1.ts' },
].filter(target => finding === 'all' || target.id === finding);
const output = path.join(repository, 'test-results/phase-e1');
mkdirSync(output, { recursive: true });
let failed = false;
for (const target of targets) {
  const workspace = path.join(repository, 'apps', target.workspace);
  const require = createRequire(path.join(workspace, 'package.json'));
  const vitestPath = require.resolve('vitest/node');
  if (target.workspace === 'desktop') {
    // Read package paths only. Importing Electron could run its download hook.
    const electronDirectory = path.dirname(require.resolve('electron/package.json'));
    const executable = readFileSync(path.join(electronDirectory, 'path.txt'), 'utf8').trim();
    if (!executable || !existsSync(path.join(electronDirectory, 'dist', executable))) {
      throw new Error('BLOCKED: Electron binary is not ready; E1 never installs dependencies.');
    }
  }
  process.chdir(workspace);
  const { startVitest } = await import(pathToFileURL(vitestPath).href);
  let context;
  try {
    context = await startVitest('test', [], {
      root: workspace,
      config: target.workspace === 'client'
        ? path.join(workspace, 'vite.config.ts')
        : target.workspace === 'server'
          ? path.join(workspace, 'vitest.config.ts')
          : false,
      include: ['e1/' + target.file],
      provide: { e1Mode: mode },
      environment: target.workspace === 'client' ? 'jsdom' : 'node',
      pool: target.workspace === 'client' ? 'vmThreads' : 'threads',
      maxWorkers: 1,
      fileParallelism: false,
      watch: false,
      cache: false,
      reporters: ['default', 'json'],
      outputFile: { json: path.join(output, mode + '-' + (target.report ?? target.id) + '.json') },
    });
    if (!context || context.state.getFiles().length === 0 || context.state.getFiles().some(file => file.result?.state === 'fail') || context.state.getUnhandledErrors().length) {
      failed = true;
    }
  } finally {
    await context?.close();
  }
}
process.chdir(repository);
process.exitCode = failed ? 1 : 0;
