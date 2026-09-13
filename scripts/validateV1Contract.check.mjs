import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { contractPath, historicalPath, isCliEntry, packagePaths, validateV1Contract } from './validateV1Contract.mjs';
import { assertCanonicalReleaseMetadata, readCanonicalReleaseMetadata } from '../apps/desktop/scripts/releaseMetadata.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const protocolPath = 'packages/shared/src/types.ts';
const write = (root, file, value) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), value);
};
const packageJson = version => JSON.stringify({ version, productName: 'Own the Block' });

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'otb-v1-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of packagePaths) write(root, file, packageJson('1.0.0'));
  write(root, protocolPath, 'export const SOCKET_PROTOCOL_VERSION = 9 as const;\n');
  write(root, contractPath, 'Product: Own the Block\nRelease: V1\nSemantic version: 1.0.0\nSocket protocol: 9\n');
  write(root, historicalPath, '# Phase 7.2\nHISTORICAL ENGINEERING RECORD\n[Current](V1_RELEASE_CONTRACT.md)\nprotocol V8; version 3.0.0\n');
  write(root, 'README.md', 'Own the Block');
  write(root, 'apps/desktop/forge.config.cjs', 'module.exports = {};');
  write(root, 'scripts/validateV1Contract.mjs', readFileSync(new URL('./validateV1Contract.mjs', import.meta.url)));
  return root;
}

test('current repository contract passes', () => validateV1Contract(repositoryRoot));

test('entry detection handles absent, missing, and unrelated entry paths', () => {
  assert.equal(isCliEntry(''), false);
  assert.equal(isCliEntry(path.join(repositoryRoot, 'package.json', 'missing')), false);
  assert.equal(isCliEntry(path.join(repositoryRoot, 'package.json')), false);
  assert.equal(isCliEntry(fileURLToPath(new URL('./validateV1Contract.mjs', import.meta.url))), true);
});

test('CLI validates the fixture through a filesystem-equivalent directory alias', t => {
  const root = fixture(t);
  const alias = `${root}-alias`;
  symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => rmSync(alias, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath, [path.join(alias, 'scripts/validateV1Contract.mjs')], { encoding: 'utf8' });
  const passing = run();
  assert.ifError(passing.error);
  assert.equal(passing.status, 0, passing.stderr);
  assert.match(passing.stdout, /V1 release contract PASS/);
  assert.equal(passing.stderr, '');

  write(root, 'package.json', packageJson('2.0.0'));
  const failing = run();
  assert.ifError(failing.error);
  assert.equal(failing.status, 1);
  assert.equal(failing.stdout, '');
  assert.match(failing.stderr, /package\.json: expected V1 version 1\.0\.0, found 2\.0\.0/);
});

const cases = [
  ['correct contract and historical V8 / 3.0.0', null, null, null],
  ...packagePaths.map(file => [`${file} version drift`, file, packageJson('2.0.0'), /expected V1 version/]),
  ['protocol drift', protocolPath, 'export const SOCKET_PROTOCOL_VERSION = 10 as const;', /SOCKET_PROTOCOL_VERSION/],
  ['missing contract', contractPath, null, /V1_RELEASE_CONTRACT/],
  ['incorrect contract version', contractPath, 'Product: Own the Block\nRelease: V1\nSemantic version: 2.0.0\nSocket protocol: 9', /Semantic version/],
  ['incorrect contract protocol', contractPath, 'Product: Own the Block\nRelease: V1\nSemantic version: 1.0.0\nSocket protocol: 8', /Socket protocol/],
  ['missing historical notice', historicalPath, '[Current](V1_RELEASE_CONTRACT.md)\nprotocol V8', /historical notice/],
  ['missing historical link', historicalPath, 'HISTORICAL ENGINEERING RECORD\nprotocol V8', /historical notice/],
  ['old Forge version', 'apps/desktop/forge.config.cjs', "const version = '3.0.0';", /obsolete product version/],
  ['old release script version', 'apps/desktop/scripts/release.mjs', "const version = '3.0.0';", /obsolete product version/],
  ['old workflow artifact', '.github/workflows/release.yml', 'artifact: OwnTheBlock-3.0.0-Setup.exe', /obsolete product version/],
  ['old package script', 'package.json', JSON.stringify({ version: '1.0.0', scripts: { release: 'package --version 3.0.0' } }), /obsolete product version/],
  ['dependency version is independent', 'package.json', JSON.stringify({ version: '1.0.0', dependencies: { example: '3.0.0', other: '13.0.0' } }), null],
  ['isolated old-version test fixture', 'apps/desktop/scripts/example.check.mjs', "const version = '3.0.0';", null],
  ['product name drift', 'apps/desktop/package.json', JSON.stringify({ version: '1.0.0', productName: 'Other' }), /productName/],
];

for (const [name, file, content, failure] of cases) {
  test(name, t => {
    const root = fixture(t);
    if (file && content === null) rmSync(path.join(root, file));
    else if (file) write(root, file, content);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/validateV1Contract.mjs')], { encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, failure ? 1 : 0, result.stderr);
    if (failure) assert.match(result.stderr, failure);
    else assert.match(result.stdout, /V1 release contract PASS/);
  });
}

test('release metadata derives identity and rejects every application mismatch', t => {
  const root = fixture(t);
  for (const extension of ['ico', 'icns']) {
    const file = `apps/desktop/assets/own-the-block.${extension}`;
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    copyFileSync(path.join(repositoryRoot, file), path.join(root, file));
  }
  assert.equal(readCanonicalReleaseMetadata(root).version, '1.0.0');
  for (const application of ['client', 'server', 'desktop']) {
    const file = `apps/${application}/package.json`;
    write(root, file, packageJson('2.0.0'));
    assert.throws(() => readCanonicalReleaseMetadata(root), /package version drift/);
    write(root, file, packageJson('1.0.0'));
  }
  assert.equal(assertCanonicalReleaseMetadata({ root, environment: {} }).version, '1.0.0');
  write(root, protocolPath, 'export const SOCKET_PROTOCOL_VERSION = 10 as const;');
  assert.throws(() => assertCanonicalReleaseMetadata({ root, environment: {} }), /SOCKET_PROTOCOL_VERSION/);
});
