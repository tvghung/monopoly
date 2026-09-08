import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const contractPath = 'project-document/ui-ux-overhaul/V1_RELEASE_CONTRACT.md';
export const historicalPath = 'project-document/ui-ux-overhaul/07C_PHASE_7_2_FINAL_ENGINEERING.md';
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
  for (const file of packagePaths) {
    const metadata = JSON.parse(read(file));
    if (metadata.version !== '1.0.0') {
      throw new Error(`${file}: expected V1 version 1.0.0, found ${String(metadata.version)}.`);
    }
    if (file === 'apps/desktop/package.json' && metadata.productName !== 'Own the Block') {
      throw new Error(`${file}: productName must be Own the Block.`);
    }
    // Dependency versions are independent of the product release.
    rejectOldVersion(file, JSON.stringify(metadata.scripts ?? {}));
  }
  requireMatch('packages/shared/src/types.ts',
    /^export const SOCKET_PROTOCOL_VERSION = 9 as const;\r?$/m,
    'expected authoritative SOCKET_PROTOCOL_VERSION = 9 as const;');
  for (const field of ['Product: Own the Block', 'Release: V1', 'Semantic version: 1.0.0', 'Socket protocol: 9']) {
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateV1Contract();
    process.stdout.write('V1 release contract PASS: Own the Block 1.0.0; Socket protocol 9.\n');
  } catch (error) {
    process.stderr.write(`V1 release contract FAIL: ${error.message}\n`);
    process.exitCode = 1;
  }
}
