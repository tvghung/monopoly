import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopRequire = createRequire(path.join(desktopRoot, 'package.json'));
const forgeConfig = desktopRequire('./forge.config.cjs') as {
  packagerConfig: {
    extraResource: string[];
    ignore: RegExp[];
    name: string;
    prune: boolean;
  };
};

// Forge delegates app-directory filtering to the installed @electron/packager.
// Resolve it from Forge's own dependency tree and run its real path filter rather
// than restating the intended ignore regexes in this test.
const forgeCoreEntry = desktopRequire.resolve('@electron-forge/core');
const packagerRequire = createRequire(forgeCoreEntry);
const { userPathFilter } = packagerRequire('@electron/packager/dist/copy-filter.js') as {
  userPathFilter: (options: Record<string, unknown>) => (file: string) => Promise<boolean>;
};
const includeAppFile = userPathFilter({
  ...forgeConfig.packagerConfig,
  dir: desktopRoot,
  out: path.join(desktopRoot, '.f2-package-boundary-no-output'),
  platform: process.platform,
  arch: process.arch,
});

function pathRepresentations(relativePath: string): string[] {
  const native = path.resolve(desktopRoot, relativePath);
  const posix = `${desktopRoot.replaceAll('\\', '/')}/${relativePath.replaceAll('\\', '/')}`;
  const candidates = [native, posix];
  if (process.platform === 'win32') {
    candidates.push(
      `${desktopRoot.replaceAll('/', '\\')}\\${relativePath.replaceAll('/', '\\')}`,
    );
  }
  return [...new Set(candidates)];
}

async function collectE1Paths(directory = 'e1'): Promise<string[]> {
  const absoluteDirectory = path.join(desktopRoot, directory);
  const descendants: string[] = [directory];
  for (const entry of await readdir(absoluteDirectory, { withFileTypes: true })) {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) descendants.push(...await collectE1Paths(child));
    else descendants.push(child);
  }
  return descendants;
}

async function expectExcluded(relativePath: string): Promise<void> {
  for (const candidate of pathRepresentations(relativePath)) {
    await expect(includeAppFile(candidate), `${relativePath} via ${candidate}`).resolves.toBe(false);
  }
}

async function expectEligible(relativePath: string): Promise<void> {
  for (const candidate of pathRepresentations(relativePath)) {
    await expect(includeAppFile(candidate), `${relativePath} via ${candidate}`).resolves.toBe(true);
  }
}

describe('Electron Forge application package boundary', () => {
  it.each([
    'e1',
    'e1/audit003.e1.ts',
    'e1/audit004.e1.ts',
    'e1/lifecycleFixture.ts',
    'e1/phaseE1Mode.ts',
    'e1/tsconfig.json',
    'e1/fixtures/nested/package-boundary-fixture.json',
  ])('excludes the E1 path %s', async relativePath => {
    await expectExcluded(relativePath);
  });

  it('excludes every current file and directory beneath the E1 root', async () => {
    const actualE1Paths = await collectE1Paths();
    expect(actualE1Paths).toEqual(expect.arrayContaining([
      'e1',
      'e1/audit003.e1.ts',
      'e1/audit004.e1.ts',
      'e1/lifecycleFixture.ts',
      'e1/phaseE1Mode.ts',
      'e1/tsconfig.json',
    ]));

    await Promise.all(actualE1Paths.map(expectExcluded));
  });

  it('preserves the existing development and configuration exclusions', async () => {
    for (const relativePath of [
      'node_modules/example/index.js',
      'generated/release-config.json',
      'src/main.ts',
      'tests/windowHandlers.test.ts',
      'scripts/compile.mjs',
      'update-policy.json',
      'tsconfig.json',
      'tsconfig.build.json',
      'forge.config.cjs',
    ]) {
      await expectExcluded(relativePath);
    }
  });

  it('keeps actual app runtime and Forge icon inputs eligible', async () => {
    // main.js comes from tsconfig.build.json; compile.mjs emits preload.js.
    // Both are required by apps/desktop/package.json and the preload webPreferences.
    for (const relativePath of [
      'dist/main.js',
      'dist/preload.js',
      'package.json',
      'cloudflared-integrity.json',
      'assets/own-the-block.ico',
      'assets/own-the-block.icns',
    ]) {
      await expectEligible(relativePath);
    }

    // The rule is rooted at the app-directory boundary; similarly named paths stay eligible.
    await expectEligible('e10/audit003.e1.ts');
  });

  it('retains every configured renderer, helper, tunnel, and release-config resource', () => {
    expect(forgeConfig.packagerConfig.extraResource.map(resource => path.resolve(resource))).toEqual([
      path.resolve(desktopRoot, '../client/dist'),
      path.resolve(desktopRoot, 'generated/release-config.json'),
      path.resolve(desktopRoot, 'generated/server-helper'),
      path.resolve(desktopRoot, 'generated/cloudflared'),
    ]);
  });
});
