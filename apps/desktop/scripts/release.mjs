import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCanonicalReleaseMetadata,
  repositoryRoot,
} from './releaseMetadata.mjs';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const environment = {
  ...process.env,
  OWN_THE_BLOCK_RELEASE_BUILD: '1',
};

try {
  assertCanonicalReleaseMetadata({
    root: repositoryRoot,
    requireEndpoint: true,
    environment,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const arch = environment.OWN_THE_BLOCK_RELEASE_ARCH;
if (arch && arch !== 'x64' && arch !== 'arm64') {
  console.error('OWN_THE_BLOCK_RELEASE_ARCH must be x64 or arm64.');
  process.exit(1);
}

const forgeArguments = arch ? ['--', `--arch=${arch}`] : [];
const make = spawnSync(
  pnpm,
  ['--filter', '@monopoly/desktop', 'make', ...forgeArguments],
  {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: environment,
    shell: process.platform === 'win32',
  },
);
if (make.error) {
  console.error(make.error);
  process.exit(1);
}
if (make.status !== 0) process.exit(make.status ?? 1);

const collect = spawnSync(
  process.execPath,
  [path.join(desktopRoot, 'scripts', 'collectArtifacts.mjs')],
  { cwd: repositoryRoot, stdio: 'inherit', env: environment },
);
if (collect.status !== 0) process.exit(collect.status ?? 1);

const validate = spawnSync(
  process.execPath,
  [path.join(desktopRoot, 'scripts', 'validateRelease.mjs'), '--release', '--artifacts'],
  { cwd: repositoryRoot, stdio: 'inherit', env: environment },
);
if (validate.status !== 0) process.exit(validate.status ?? 1);
