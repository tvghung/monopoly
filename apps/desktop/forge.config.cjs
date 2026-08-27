const path = require('node:path');

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
  ? { identity: process.env.OWN_THE_BLOCK_MACOS_SIGN_IDENTITY }
  : undefined;
const osxNotarize = signedDistribution
  && process.env.OWN_THE_BLOCK_APPLE_ID
  && process.env.OWN_THE_BLOCK_APPLE_APP_SPECIFIC_PASSWORD
  && process.env.OWN_THE_BLOCK_APPLE_TEAM_ID
  ? {
      appleId: process.env.OWN_THE_BLOCK_APPLE_ID,
      appleIdPassword: process.env.OWN_THE_BLOCK_APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.OWN_THE_BLOCK_APPLE_TEAM_ID,
    }
  : undefined;

module.exports = {
  packagerConfig: {
    name: 'Own the Block',
    executableName: 'OwnTheBlock',
    appVersion: releaseVersion,
    icon: nativeIcon,
    osxSign,
    osxNotarize,
    asar: true,
    // The compiled main/preload code has no runtime npm dependencies. Keep the
    // development workspace out of the packaged app without invoking pnpm's
    // dependency-pruning walker over its symlink layout.
    prune: false,
    ignore: [/^\/node_modules/],
    extraResource: [path.resolve(__dirname, '../client/dist'), releaseConfig],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'own_the_block',
        setupExe: `OwnTheBlock-${releaseVersion}-win32-x64-Setup.exe`,
        ...windowsSigning,
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'ULFO',
      },
    },
  ],
};
