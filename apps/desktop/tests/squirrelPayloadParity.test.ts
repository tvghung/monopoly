import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopRequire = createRequire(path.join(desktopRoot, 'package.json'));
const rootPackage = desktopRequire('../../package.json') as { version: string };
const desktopPackage = desktopRequire('./package.json') as { version: string; productName: string };
const forgeConfig = desktopRequire('./forge.config.cjs') as {
  packagerConfig: {
    appVersion: string;
    executableName: string;
    extraResource: string[];
    ignore: RegExp[];
    name: string;
  };
  makers: Array<{
    name: string;
    platforms: string[];
    config: Record<string, unknown> & {
      additionalFiles?: Array<{ src: string; target: string }>;
      certificateFile?: string;
      certificatePassword?: string;
      name?: string;
      setupExe?: string;
    };
  }>;
};
const squirrelMaker = forgeConfig.makers.find(maker => maker.name === '@electron-forge/maker-squirrel');
if (!squirrelMaker) throw new Error('Forge Squirrel maker configuration is missing');

const makerRequire = createRequire(desktopRequire.resolve('@electron-forge/maker-squirrel'));
const installerEntry = makerRequire.resolve('electron-winstaller');
const installerRoot = path.resolve(path.dirname(installerEntry), '..');
const nuspecTemplatePath = path.join(installerRoot, 'template.nuspectemplate');

describe('Squirrel NuSpec payload parity', () => {
  it('adds exactly the two root Electron distribution files missing from the F5 payload', () => {
    expect(squirrelMaker.config.additionalFiles).toEqual([
      { src: 'LICENSES.chromium.html', target: 'lib\\net45\\LICENSES.chromium.html' },
      { src: 'version', target: 'lib\\net45\\version' },
    ]);
  });

  it('retains the installed NuSpec runtime globs and delegates explicit additions to additionalFiles', async () => {
    const template = await readFile(nuspecTemplatePath, 'utf8');
    for (const requiredPattern of [
      '<file src="locales\\**" target="lib\\net45\\locales" />',
      '<file src="resources\\**" target="lib\\net45\\resources" />',
      '<file src="*.dll" target="lib\\net45" />',
      '<file src="*.pak" target="lib\\net45" />',
      '<file src="icudtl.dat" target="lib\\net45\\icudtl.dat" />',
      '<file src="LICENSE" target="lib\\net45\\LICENSE" />',
      '<file src="<%- exe %>" target="lib\\net45\\<%- exe %>" />',
      '<file src="<%- f.src %>" target="<%- f.target %>" />',
    ]) {
      expect(template).toContain(requiredPattern);
    }
    expect(template).not.toMatch(/<file\s+src="(?:\*\*|\*\.\*)"/i);
  });

  it('keeps the Windows maker, application identity, and version unchanged', () => {
    expect(squirrelMaker.platforms).toEqual(['win32']);
    expect(squirrelMaker.config.name).toBe('own_the_block');
    expect(squirrelMaker.config.setupExe).toBe(`OwnTheBlock-${rootPackage.version}-win32-x64-Setup.exe`);
    expect(forgeConfig.packagerConfig.name).toBe('Own the Block');
    expect(forgeConfig.packagerConfig.executableName).toBe('OwnTheBlock');
    expect(forgeConfig.packagerConfig.appVersion).toBe(rootPackage.version);
    expect(desktopPackage.version).toBe(rootPackage.version);
    expect(desktopPackage.productName).toBe('Own the Block');
  });

  it('keeps the Packager development boundary and existing runtime resources', () => {
    expect(forgeConfig.packagerConfig.ignore.some(pattern => pattern.test('/e1/audit003.e1.ts'))).toBe(true);
    expect(forgeConfig.packagerConfig.ignore.some(pattern => pattern.test('/tests/squirrelPayloadParity.test.ts'))).toBe(true);
    expect(forgeConfig.packagerConfig.extraResource.map(resource => path.resolve(resource))).toEqual([
      path.resolve(desktopRoot, '../client/dist'),
      path.resolve(desktopRoot, 'generated/release-config.json'),
      path.resolve(desktopRoot, 'generated/server-helper'),
      path.resolve(desktopRoot, 'generated/cloudflared'),
    ]);
    expect(squirrelMaker.config.additionalFiles).toHaveLength(2);
  });

  it('keeps signing inputs gated by the existing distribution mode', () => {
    if (process.env.OWN_THE_BLOCK_DISTRIBUTION_MODE === 'signed') {
      expect(squirrelMaker.config.certificateFile).toBe(process.env.OWN_THE_BLOCK_WINDOWS_CERTIFICATE_FILE);
      expect(squirrelMaker.config.certificatePassword).toBe(process.env.OWN_THE_BLOCK_WINDOWS_CERTIFICATE_PASSWORD);
    } else {
      expect(squirrelMaker.config).not.toHaveProperty('certificateFile');
      expect(squirrelMaker.config).not.toHaveProperty('certificatePassword');
    }
  });
});
