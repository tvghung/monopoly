import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(desktopRoot, 'src');
const outputRoot = path.join(desktopRoot, 'dist');
const repositoryRoot = path.resolve(desktopRoot, '../..');
const serverRoot = path.join(repositoryRoot, 'apps', 'server');
const helperOutputRoot = path.join(desktopRoot, 'generated', 'server-helper');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const typeScript = spawnSync(pnpm, ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
  cwd: desktopRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (typeScript.status !== 0) process.exit(typeScript.status ?? 1);

await rm(helperOutputRoot, { recursive: true, force: true });
await mkdir(path.join(helperOutputRoot, 'migrations'), { recursive: true });

for (const entryPoint of ['desktopServerHelper.ts', 'phase7Contract.ts', 'phase71LanContract.ts']) {
  await build({
    entryPoints: [path.join(serverRoot, 'src', entryPoint)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    outfile: path.join(
      helperOutputRoot,
      entryPoint === 'desktopServerHelper.ts'
        ? 'server-helper.cjs'
        : entryPoint === 'phase7Contract.ts'
          ? 'phase7-contract.cjs'
          : 'phase71-lan-contract.cjs',
    ),
    sourcemap: false,
    legalComments: 'none',
  });
}

const migrationSource = path.join(serverRoot, 'migrations');
const migrationManifest = [];
for (const fileName of (await readdir(migrationSource)).sort()) {
  if (!/^\d+_[a-z0-9_]+\.sql$/u.test(fileName)) continue;
  const sql = (await readFile(path.join(migrationSource, fileName), 'utf8')).replace(/\r\n?/gu, '\n');
  migrationManifest.push({ version: fileName, checksum: createHash('sha256').update(sql).digest('hex') });
  await cp(path.join(migrationSource, fileName), path.join(helperOutputRoot, 'migrations', fileName));
}
await writeFile(
  path.join(helperOutputRoot, 'migrations', 'manifest.json'),
  `${JSON.stringify({ postgresMajor: '17', migrations: migrationManifest }, null, 2)}\n`,
  'utf8',
);

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
