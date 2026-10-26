import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (process.env.OTB_TEST_NETWORK_GUARD !== undefined
  && process.env.OTB_TEST_NETWORK_GUARD !== 'loopback-only') {
  throw new Error('Unsupported OTB_TEST_NETWORK_GUARD mode: ' + process.env.OTB_TEST_NETWORK_GUARD);
}

process.env.OTB_TEST_NETWORK_GUARD = 'loopback-only';

const guardPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'networkListenGuard.cjs');
const require = createRequire(import.meta.url);
const guard = require(guardPath) as {
  installSafeTestNetworkGuard(): boolean;
};

guard.installSafeTestNetworkGuard();

const inheritedPreload = '--import=' + pathToFileURL(guardPath).href;
const inheritedOptions = process.env.NODE_OPTIONS ?? '';
if (!inheritedOptions.includes(inheritedPreload)) {
  process.env.NODE_OPTIONS = (inheritedOptions + ' ' + inheritedPreload).trim();
}
