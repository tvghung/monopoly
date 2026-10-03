const path = require('node:path');
const { pathToFileURL } = require('node:url');

const rootPackage = require(path.resolve(__dirname, '../../package.json'));
const releaseVersion = rootPackage.version;
const nativeIcon = path.resolve(
  __dirname,
  'assets',
  process.platform === 'darwin' ? 'own-the-block.icns' : 'own-the-block.ico',
);
const releaseConfig = path.resolve(__dirname, 'generated/release-config.json');
const signedDistribution = process.env.OWN_THE_BLOCK_DISTRIBUTION_MODE === 'signed';

const windowsSigning = signedDistribution
  ? {
      certificateFile: process.env.OWN_THE_BLOCK_WINDOWS_CERTIFICATE_FILE,
      certificatePassword: process.env.OWN_THE_BLOCK_WINDOWS_CERTIFICATE_PASSWORD,
    }
  : {};

const osxSign = signedDistribution && process.env.OWN_THE_BLOCK_MACOS_SIGN_IDENTITY
  ? {
      identity: process.env.OWN_THE_BLOCK_MACOS_SIGN_IDENTITY,
      keychain: process.env.OWN_THE_BLOCK_MACOS_KEYCHAIN,
    }
  : undefined;

module.exports = {
  packagerConfig: {
    name: 'Own the Block',
    executableName: 'OwnTheBlock',
    appVersion: releaseVersion,
    icon: nativeIcon,
    osxSign,
    asar: true,
    // The compiled main/preload code has no runtime npm dependencies. Keep the
    // development workspace out of the packaged app without invoking pnpm's
    // dependency-pruning walker over its symlink layout.
    prune: false,
    // app.asar only needs dist/ and package.json. generated/ (managed PostgreSQL and the
    // server helper) ships once through extraResource and is read from
    // process.resourcesPath; packing it into app.asar as well duplicated about 139 MiB.
    ignore: [/^\/node_modules/, /^\/(?:generated|src|tests|scripts)(?:\/|$)/],
    extraResource: [
      path.resolve(__dirname, '../client/dist'),
      releaseConfig,
      path.resolve(__dirname, 'generated/postgres'),
      path.resolve(__dirname, 'generated/server-helper'),
    ],
  },
  hooks: {
    // Runs on the freshly extracted Electron build, before the app is copied in and before signing.
    packageAfterExtract: async (_forgeConfig, buildPath, _electronVersion, platform) => {
      const { pruneElectronLocales } = await import(
        pathToFileURL(path.resolve(__dirname, 'scripts/pruneElectronLocales.mjs')).href
      );
      const result = await pruneElectronLocales(buildPath, platform);
      if (platform === 'darwin') {
        console.log(`Electron locale bundles kept on macOS (not pruned yet): ${result.listed.length}`);
      } else {
        console.log(`Electron locales kept: ${result.kept.join(', ')}; removed ${result.removed.length}`);
      }
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'own_the_block',
        setupExe: `OwnTheBlock-${releaseVersion}-win32-x64-Setup.exe`,
        setupIcon: nativeIcon,
        ...windowsSigning,
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'ULFO',
        icon: nativeIcon,
      },
    },
  ],
};
