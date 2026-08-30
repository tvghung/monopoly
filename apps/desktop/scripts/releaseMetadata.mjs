import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_CONFIG_FILE_NAME = 'release-config.json';
export const RELEASE_SOCKET_URL_ENV = 'OWN_THE_BLOCK_RELEASE_SOCKET_URL';
export const RELEASE_BUILD_ENV = 'OWN_THE_BLOCK_RELEASE_BUILD';
export const RELEASE_PLATFORM_ENV = 'OWN_THE_BLOCK_RELEASE_PLATFORM';
export const RELEASE_ARCH_ENV = 'OWN_THE_BLOCK_RELEASE_ARCH';
export const DISTRIBUTION_MODE_ENV = 'OWN_THE_BLOCK_DISTRIBUTION_MODE';
export const EXPECTED_PRODUCT_NAME = 'Own the Block';
export const EXPECTED_EXECUTABLE_NAME = 'OwnTheBlock';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RELEASE_PLATFORMS = new Set(['win32', 'darwin']);
const RELEASE_ARCHITECTURES = new Set(['x64', 'arm64']);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDirectory, '../../..');

export function resolveReleaseTarget({
  environment = process.env,
  actualPlatform = process.platform,
  actualArchitecture = process.arch,
} = {}) {
  const platform = environment[RELEASE_PLATFORM_ENV]?.trim() || actualPlatform;
  const architecture = environment[RELEASE_ARCH_ENV]?.trim() || actualArchitecture;

  if (!RELEASE_PLATFORMS.has(platform)) {
    throw new Error(`${RELEASE_PLATFORM_ENV} must be win32 or darwin.`);
  }
  if (platform !== actualPlatform) {
    throw new Error(
      `${RELEASE_PLATFORM_ENV}=${platform} does not match the current host platform ${actualPlatform}.`,
    );
  }
  if (!RELEASE_ARCHITECTURES.has(architecture)) {
    throw new Error(`${RELEASE_ARCH_ENV} must be x64 or arm64.`);
  }
  if (architecture !== actualArchitecture) {
    throw new Error(
      `${RELEASE_ARCH_ENV}=${architecture} does not match the current host architecture ${actualArchitecture}.`,
    );
  }

  return { platform, architecture };
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read JSON metadata from ${filePath}.`, { cause: error });
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNativeIcon(filePath, format) {
  const bytes = readFileSync(filePath);
  if (format === 'ico') {
    if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) {
      throw new Error(`Native Windows icon is not a valid ICO file: ${filePath}.`);
    }
    const entryCount = bytes.readUInt16LE(4);
    if (entryCount < 4 || bytes.length < 6 + entryCount * 16) {
      throw new Error(`Native Windows icon has insufficient image entries: ${filePath}.`);
    }
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = 6 + index * 16;
      const byteLength = bytes.readUInt32LE(entryOffset + 8);
      const imageOffset = bytes.readUInt32LE(entryOffset + 12);
      if (byteLength === 0 || imageOffset + byteLength > bytes.length) {
        throw new Error(`Native Windows icon contains an invalid image entry: ${filePath}.`);
      }
    }
    return;
  }

  if (bytes.length < 8 || bytes.subarray(0, 4).toString('ascii') !== 'icns'
    || bytes.readUInt32BE(4) !== bytes.length) {
    throw new Error(`Native macOS icon is not a valid ICNS file: ${filePath}.`);
  }
  const requiredTypes = new Set(['ic07', 'ic08', 'ic09', 'ic10']);
  let offset = 8;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error(`Native macOS icon has a truncated chunk: ${filePath}.`);
    const chunkLength = bytes.readUInt32BE(offset + 4);
    if (chunkLength < 8 || offset + chunkLength > bytes.length) {
      throw new Error(`Native macOS icon contains an invalid chunk: ${filePath}.`);
    }
    requiredTypes.delete(bytes.subarray(offset, offset + 4).toString('ascii'));
    offset += chunkLength;
  }
  if (requiredTypes.size > 0) {
    throw new Error(`Native macOS icon is missing required sizes: ${filePath}.`);
  }
}

export function releaseConfigPath(root = repositoryRoot) {
  return path.join(root, 'apps', 'desktop', 'generated', RELEASE_CONFIG_FILE_NAME);
}

export function nativeIconPaths(root = repositoryRoot) {
  const iconRoot = path.join(root, 'apps', 'desktop', 'assets', 'own-the-block');
  return {
    windows: `${iconRoot}.ico`,
    macos: `${iconRoot}.icns`,
  };
}

export function readCanonicalReleaseMetadata(root = repositoryRoot) {
  const rootPackage = readJson(path.join(root, 'package.json'));
  const desktopPackage = readJson(path.join(root, 'apps', 'desktop', 'package.json'));
  const version = rootPackage.version;

  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new Error('Root package.json must contain a valid semver release version.');
  }
  if (desktopPackage.version !== version) {
    throw new Error(
      `Desktop package version drift: expected ${version}, found ${String(desktopPackage.version)}.`,
    );
  }
  if (desktopPackage.productName !== EXPECTED_PRODUCT_NAME) {
    throw new Error(`Desktop productName must be ${EXPECTED_PRODUCT_NAME}.`);
  }

  const icons = nativeIconPaths(root);
  if (!existsSync(icons.windows)) throw new Error(`Required native icon is missing: ${icons.windows}.`);
  if (!existsSync(icons.macos)) throw new Error(`Required native icon is missing: ${icons.macos}.`);
  assertNativeIcon(icons.windows, 'ico');
  assertNativeIcon(icons.macos, 'icns');

  return {
    version,
    productName: EXPECTED_PRODUCT_NAME,
    executableName: EXPECTED_EXECUTABLE_NAME,
    icons,
  };
}

export function normalizeReleaseSocketUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      `${RELEASE_SOCKET_URL_ENV} must be an absolute http or https URL.`,
    );
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch (error) {
    throw new Error(
      `${RELEASE_SOCKET_URL_ENV} must be an absolute http or https URL.`,
      { cause: error },
    );
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new Error(
      `${RELEASE_SOCKET_URL_ENV} must be an absolute http or https URL.`,
    );
  }
  return parsed.toString().replace(/\/$/, '');
}

export function resolveReleaseSocketUrl({
  environment = process.env,
  required = false,
} = {}) {
  const rawValue = environment[RELEASE_SOCKET_URL_ENV];
  if (rawValue === undefined || rawValue.trim() === '') {
    if (required) {
      throw new Error(
        `${RELEASE_SOCKET_URL_ENV} is required for a release build; no production endpoint was supplied.`,
      );
    }
    return undefined;
  }
  return normalizeReleaseSocketUrl(rawValue);
}

export function readGeneratedReleaseConfig(root = repositoryRoot) {
  const configPath = releaseConfigPath(root);
  if (!existsSync(configPath)) {
    throw new Error(`Generated release configuration is missing: ${configPath}.`);
  }
  const config = readJson(configPath);
  if (!isRecord(config)) throw new Error('Generated release configuration must be a JSON object.');
  return config;
}

export function signingStatus({
  platform = process.platform,
  mode = process.env[DISTRIBUTION_MODE_ENV] || 'unsigned-validation',
  environment = process.env,
} = {}) {
  if (mode === 'unsigned-validation') {
    return {
      mode,
      signing: 'BLOCKED',
      notarization: platform === 'darwin' ? 'BLOCKED' : 'NOT RUN',
    };
  }
  if (mode !== 'signed') throw new Error(`${DISTRIBUTION_MODE_ENV} must be signed or unsigned-validation.`);
  if (!RELEASE_PLATFORMS.has(platform)) {
    throw new Error(`Signed distribution is unsupported on ${platform}.`);
  }

  const required = platform === 'win32'
    ? [
        'OWN_THE_BLOCK_WINDOWS_CERTIFICATE_FILE',
        'OWN_THE_BLOCK_WINDOWS_CERTIFICATE_PASSWORD',
      ]
    : [
        'OWN_THE_BLOCK_MACOS_CERTIFICATE_FILE',
        'OWN_THE_BLOCK_MACOS_KEYCHAIN',
        'OWN_THE_BLOCK_MACOS_SIGN_IDENTITY',
        'OWN_THE_BLOCK_APPLE_ID',
        'OWN_THE_BLOCK_APPLE_APP_SPECIFIC_PASSWORD',
        'OWN_THE_BLOCK_APPLE_TEAM_ID',
      ];
  const missing = required.filter(name => (
    typeof environment[name] !== 'string' || !environment[name].trim()
  ));
  if (missing.length > 0) {
    throw new Error(`Signed distribution is missing secure CI input: ${missing.join(', ')}.`);
  }

  const fileInputs = platform === 'win32'
    ? ['OWN_THE_BLOCK_WINDOWS_CERTIFICATE_FILE']
    : ['OWN_THE_BLOCK_MACOS_CERTIFICATE_FILE', 'OWN_THE_BLOCK_MACOS_KEYCHAIN'];
  const missingFiles = fileInputs.filter(name => !existsSync(environment[name].trim()));
  if (missingFiles.length > 0) {
    throw new Error(`Signed distribution secure file input does not exist: ${missingFiles.join(', ')}.`);
  }

  return {
    mode,
    signing: 'CONFIGURED',
    notarization: platform === 'darwin' ? 'CONFIGURED' : 'NOT RUN',
  };
}

export function assertCanonicalReleaseMetadata({
  root = repositoryRoot,
  requireEndpoint = false,
  environment = process.env,
} = {}) {
  const metadata = readCanonicalReleaseMetadata(root);
  const endpoint = resolveReleaseSocketUrl({ environment, required: requireEndpoint });
  return { ...metadata, endpoint };
}
