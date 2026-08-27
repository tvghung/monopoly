import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCanonicalReleaseMetadata,
  DISTRIBUTION_MODE_ENV,
  resolveReleaseTarget,
  repositoryRoot,
  signingStatus,
} from './releaseMetadata.mjs';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const environment = {
  ...process.env,
  OWN_THE_BLOCK_RELEASE_BUILD: '1',
};

let metadata;
let target;
let signing;
try {
  metadata = assertCanonicalReleaseMetadata({
    root: repositoryRoot,
    requireEndpoint: true,
    environment,
  });
  target = resolveReleaseTarget({ environment });
  signing = signingStatus({
    platform: target.platform,
    mode: environment[DISTRIBUTION_MODE_ENV] || 'unsigned-validation',
    environment,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const outputRoot = path.join(repositoryRoot, 'apps', 'desktop', 'out');
const packageRoot = path.join(
  outputRoot,
  `${metadata.productName}-${target.platform}-${target.architecture}`,
);
await Promise.all([
  rm(path.join(outputRoot, 'make'), { recursive: true, force: true }),
  rm(path.join(outputRoot, 'release-artifacts'), { recursive: true, force: true }),
  rm(packageRoot, { recursive: true, force: true }),
]);

function runRequiredCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

async function findFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findFiles(entryPath, predicate));
    else if (entry.isFile() && predicate(entryPath)) files.push(entryPath);
  }
  return files;
}

async function finalizeMacDistribution() {
  if (target.platform !== 'darwin' || signing.mode !== 'signed') return;

  const identity = environment.OWN_THE_BLOCK_MACOS_SIGN_IDENTITY;
  if (!identity.startsWith('Developer ID Application:')) {
    throw new Error(
      'OWN_THE_BLOCK_MACOS_SIGN_IDENTITY must name a Developer ID Application certificate.',
    );
  }

  const appPath = path.join(packageRoot, `${metadata.productName}.app`);
  if (!existsSync(appPath)) {
    throw new Error(`Packaged macOS app is missing: ${appPath}.`);
  }

  const makeRoot = path.join(outputRoot, 'make');
  const dmgPaths = await findFiles(
    makeRoot,
    filePath => path.extname(filePath).toLowerCase() === '.dmg',
  );
  if (dmgPaths.length !== 1) {
    throw new Error(`Expected exactly one macOS DMG under ${makeRoot}, found ${dmgPaths.length}.`);
  }
  const [dmgPath] = dmgPaths;

  runRequiredCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  runRequiredCommand('codesign', [
    '--force',
    '--timestamp',
    '--sign',
    identity,
    dmgPath,
  ]);
  runRequiredCommand('codesign', ['--verify', '--verbose=2', dmgPath]);
  runRequiredCommand('xcrun', [
    'notarytool',
    'submit',
    dmgPath,
    '--apple-id',
    environment.OWN_THE_BLOCK_APPLE_ID,
    '--password',
    environment.OWN_THE_BLOCK_APPLE_APP_SPECIFIC_PASSWORD,
    '--team-id',
    environment.OWN_THE_BLOCK_APPLE_TEAM_ID,
    '--wait',
  ]);
  runRequiredCommand('xcrun', ['stapler', 'staple', dmgPath]);
  runRequiredCommand('xcrun', ['stapler', 'validate', dmgPath]);
}

const forgeArguments = ['--', `--arch=${target.architecture}`];
try {
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
  if (make.error) throw make.error;
  if (make.status !== 0) process.exit(make.status ?? 1);
  await finalizeMacDistribution();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

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
