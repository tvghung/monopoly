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
    // Runtime binaries ship once as external resources.
    // update-policy.json is release tooling input (it becomes update-manifest.json at publish time), not app data.
    ignore: [/^\/node_modules/, /^\/(?:generated|src|tests|scripts)(?:\/|$)/, /^\/update-policy\.json$/],
    extraResource: [
      path.resolve(__dirname, '../client/dist'),
      releaseConfig,
      path.resolve(__dirname, 'generated/server-helper'),
      path.resolve(__dirname, 'generated/cloudflared'),
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
        // LZMA (macOS 10.15+; Electron 43 itself needs macOS 12+) packs the Chromium framework tighter than LZFSE.
        format: 'ULMO',
        icon: nativeIcon,
      },
    },
  ],
};
