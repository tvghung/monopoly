import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(desktopRoot, 'out');
const packageEntries = await readdir(outRoot, { withFileTypes: true });
const platformToken = process.platform === 'win32' ? 'win32-' : 'darwin-';
const packageEntry = packageEntries.find(entry => (
  entry.isDirectory()
  && entry.name.startsWith(`Own the Block-${platformToken}`)
));
if (!packageEntry) throw new Error('No packaged Own the Block application was found in apps/desktop/out');

const packageRoot = path.join(outRoot, packageEntry.name);
const executableCandidates = process.platform === 'win32'
  ? [path.join(packageRoot, 'OwnTheBlock.exe'), path.join(packageRoot, 'Own the Block.exe')]
  : [
      path.join(packageRoot, 'Own the Block.app', 'Contents', 'MacOS', 'OwnTheBlock'),
      path.join(packageRoot, 'Own the Block.app', 'Contents', 'MacOS', 'Own the Block'),
    ];
const executable = executableCandidates.find(candidate => {
  return existsSync(candidate);
});
if (!executable) throw new Error(`Packaged Own the Block executable was not found under ${packageRoot}`);

const child = spawn(executable, ['--phase7-runtime-proof'], {
  cwd: packageRoot,
  stdio: 'inherit',
  windowsHide: true,
});
child.once('error', error => {
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', code => {
  process.exitCode = code ?? 1;
});
