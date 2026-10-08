import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const contractPath = 'project-document/ui-ux-overhaul/V1_RELEASE_CONTRACT.md';
export const historicalPath = 'project-document/ui-ux-overhaul/07C_PHASE_7_2_FINAL_ENGINEERING.md';
export const updatePolicyPath = 'apps/desktop/update-policy.json';
export const packagePaths = [
  'package.json', 'apps/client/package.json', 'apps/server/package.json',
  'apps/desktop/package.json', 'packages/shared/package.json',
];

export function validateV1Contract(root = repositoryRoot) {
  const read = file => readFileSync(path.join(root, file), 'utf8');
  const requireMatch = (file, pattern, message) => {
    if (!pattern.test(read(file))) throw new Error(`${file}: ${message}`);
  };
  const rejectOldVersion = (file, content) => {
    if (/(?<![\d.])3\.0\.0(?![\d.])/.test(content)) {
      throw new Error(`${file}: obsolete product version; derive release identity from package metadata.`);
    }
  };
  // The release version is written once, in the contract ("Semantic version: x.y.z"); every package must carry it.
  const contractVersion = /^Semantic version: (\d+\.\d+\.\d+)\s*$/m.exec(read(contractPath))?.[1];
  if (!contractVersion) {
    throw new Error(`${contractPath}: required contract field "Semantic version: x.y.z" is missing or incorrect.`);
  }
  for (const file of packagePaths) {
    const metadata = JSON.parse(read(file));
    if (metadata.version !== contractVersion) {
      throw new Error(`${file}: expected V1 version ${contractVersion}, found ${String(metadata.version)}.`);
    }
    if (file === 'apps/desktop/package.json' && metadata.productName !== 'Own the Block') {
      throw new Error(`${file}: productName must be Own the Block.`);
    }
    // Dependency versions are independent of the product release.
    rejectOldVersion(file, JSON.stringify(metadata.scripts ?? {}));
  }
  requireMatch('packages/shared/src/types.ts',
    /^export const SOCKET_PROTOCOL_VERSION = 12 as const;\r?$/m,
    'expected authoritative SOCKET_PROTOCOL_VERSION = 12 as const;');
  validateUpdatePolicy(read, contractVersion);
  for (const field of ['Product: Own the Block', 'Release: V1', `Semantic version: ${contractVersion}`, 'Socket protocol: 12']) {
    if (!read(contractPath).split(/\r?\n/).includes(field)) {
      throw new Error(`${contractPath}: required contract field "${field}" is missing or incorrect.`);
    }
  }
  const notice = read(historicalPath).split(/\r?\n/).slice(0, 15).join('\n');
  if (!notice.includes('HISTORICAL ENGINEERING RECORD') || !notice.includes('(V1_RELEASE_CONTRACT.md)')) {
    throw new Error(`${historicalPath}: add the historical notice and link to V1_RELEASE_CONTRACT.md near the top.`);
  }

  // Current executable configuration only; historical records and isolated tests
  // are deliberately outside this scan. Extend these roots when adding tooling.
  for (const directory of ['scripts', 'apps/client/scripts', 'apps/server/scripts', 'apps/desktop/scripts', '.github/workflows']) {
    let entries;
    try {
      entries = readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || /\.(?:test|check)\./.test(entry.name)
        || !/\.(?:[cm]?[jt]s|json|ya?ml|ps1|sh)$/.test(entry.name)) continue;
      const file = path.relative(root, path.join(entry.parentPath, entry.name));
      rejectOldVersion(file, read(file));
    }
  }
  for (const file of ['apps/desktop/forge.config.cjs', 'README.md', contractPath]) {
    rejectOldVersion(file, read(file));
  }
  return contractVersion;
}

/**
 * The in-app updater reads `minimumSupportedVersion` from this policy (through `update-manifest.json`): a version below it
 * must update before it plays multiplayer. A socket protocol change is the moment that decision matters, so the policy
 * records which protocol it was last reviewed for, and a protocol bump fails here until someone has looked at it.
 * (Self-contained on purpose: the fixtures of `validateV1Contract.check.mjs` copy only this file.)
 */
function validateUpdatePolicy(read, contractVersion) {
  let policy;
  try {
    policy = JSON.parse(read(updatePolicyPath));
  } catch (error) {
    throw new Error(`${updatePolicyPath}: the update policy is missing or is not JSON.`, { cause: error });
  }
  const floor = policy?.minimumSupportedVersion;
  if (typeof floor !== 'string' || !/^\d+\.\d+\.\d+$/.test(floor)) {
    throw new Error(`${updatePolicyPath}: minimumSupportedVersion must be a plain x.y.z version.`);
  }
  const floorParts = floor.split('.').map(Number);
  const releaseParts = contractVersion.split('.').map(Number);
  const difference = floorParts.findIndex((part, index) => part !== releaseParts[index]);
  if (difference !== -1 && floorParts[difference] > releaseParts[difference]) {
    throw new Error(`${updatePolicyPath}: minimumSupportedVersion ${floor} is newer than the release ${contractVersion}.`);
  }
  const protocol = Number(/^export const SOCKET_PROTOCOL_VERSION = (\d+) as const;/m.exec(read('packages/shared/src/types.ts'))?.[1]);
  if (policy.reviewedForSocketProtocol !== protocol) {
    throw new Error(
      `${updatePolicyPath}: reviewedForSocketProtocol ${String(policy.reviewedForSocketProtocol)} differs from SOCKET_PROTOCOL_VERSION ${protocol}. `
      + 'A protocol change decides whether older versions must update: set minimumSupportedVersion for it, then update this field.',
    );
  }
}

export function isCliEntry(entryPath = process.argv[1]) {
  if (!entryPath) return false;
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

if (isCliEntry()) {
  try {
    const version = validateV1Contract();
    process.stdout.write(`V1 release contract PASS: Own the Block ${version}; Socket protocol 12.\n`);
  } catch (error) {
    process.stderr.write(`V1 release contract FAIL: ${error.message}\n`);
    process.exitCode = 1;
  }
}
