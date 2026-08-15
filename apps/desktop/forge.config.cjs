const path = require('node:path');

module.exports = {
  packagerConfig: {
    name: 'Own the Block',
    executableName: 'OwnTheBlock',
    // The renderer has the deterministic favicon placeholder. Native .ico/.icns
    // artwork is intentionally deferred until the distribution polish phase.
    asar: true,
    // The compiled main/preload code has no runtime npm dependencies. Keep the
    // development workspace out of the packaged app without invoking pnpm's
    // dependency-pruning walker over its symlink layout.
    prune: false,
    ignore: [/^\/node_modules/],
    extraResource: [path.resolve(__dirname, '../client/dist')],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'own_the_block',
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
