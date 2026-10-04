/**
 * Where the app looks for updates and which hosts it trusts.
 *
 * Every release carries a small `update-manifest.json` next to its installers (written by `scripts/stageReleaseAssets.mjs`).
 * The app reads the one of the latest release, `releases/latest/download/update-manifest.json`, which is a plain web URL and
 * so is not subject to the GitHub API rate limit that players behind one LAN address would share. The manifest names the
 * installers and their checksums but never a URL: the download URL is built here from the release version and the file
 * name, so a malformed or tampered manifest cannot point the app at another host.
 */
export const UPDATE_REPOSITORY = 'tvghung/monopoly';
export const UPDATE_MANIFEST_FILE_NAME = 'update-manifest.json';

/** The only place a development run may take its feed from: `OWN_THE_BLOCK_UPDATE_MANIFEST_URL`, loopback only. */
export const DEV_UPDATE_MANIFEST_ENV = 'OWN_THE_BLOCK_UPDATE_MANIFEST_URL';

/** The first check waits for the window to settle, so it never competes with the start of the app. */
export const STARTUP_CHECK_DELAY_MS = 2_000;
/** A game session can stay open for hours: the app looks again about every six hours (only when nothing is pending). */
export const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
export const MANIFEST_TIMEOUT_MS = 15_000;
/** The download stops when no byte arrives for this long (a slow link is fine, a dead one is not). */
export const DOWNLOAD_STALL_TIMEOUT_MS = 30_000;
/** The headers of a download must arrive within this long. */
export const DOWNLOAD_CONNECT_TIMEOUT_MS = 30_000;
/** A silent Setup.exe takes tens of seconds; this is the point where the app stops waiting for it. */
export const INSTALL_TIMEOUT_MS = 10 * 60 * 1_000;
/** Free disk space that must remain after the download (the installer is unpacked by the installer, not here). */
export const DOWNLOAD_HEADROOM_BYTES = 64 * 1024 * 1024;

export interface UpdateEndpoints {
  manifestUrl: string;
  /** Where the installer `name` of the release `version` is downloaded from. */
  assetUrl: (version: string, name: string) => string;
  /** Whether a response (after redirects) may be read: the host must be one the endpoints trust. */
  isUrlAllowed: (url: URL) => boolean;
}

export function releaseAssetUrl(version: string, name: string): string {
  return `https://github.com/${UPDATE_REPOSITORY}/releases/download/v${version}/${name}`;
}

/**
 * GitHub answers a release download with a redirect to its object storage. Both ends are GitHub's own hosts and only
 * HTTPS is accepted; anything else (a redirect to another site, a downgrade to HTTP) is refused.
 */
export function isGithubUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  return url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com');
}

export function productionEndpoints(): UpdateEndpoints {
  return {
    manifestUrl: `https://github.com/${UPDATE_REPOSITORY}/releases/latest/download/${UPDATE_MANIFEST_FILE_NAME}`,
    assetUrl: releaseAssetUrl,
    isUrlAllowed: isGithubUrl,
  };
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * A development run (never a packaged app) can point at a feed served from this machine, to see the update screens and
 * the download without publishing a release. The installers are read from the same directory as the manifest.
 */
export function developmentEndpoints(manifestUrl: string | undefined): UpdateEndpoints | undefined {
  if (manifestUrl === undefined || manifestUrl.trim() === '') return undefined;
  let manifest: URL;
  try {
    manifest = new URL(manifestUrl.trim());
  } catch {
    return undefined;
  }
  if ((manifest.protocol !== 'http:' && manifest.protocol !== 'https:') || !LOOPBACK_HOSTS.has(manifest.hostname)) {
    return undefined;
  }
  return {
    manifestUrl: manifest.toString(),
    assetUrl: (_version, name) => new URL(name, manifest).toString(),
    isUrlAllowed: url => (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname),
  };
}

/** The endpoints of this run, or undefined when there is no update channel (a development run without a feed). */
export function resolveUpdateEndpoints(options: {
  packaged: boolean;
  env: NodeJS.ProcessEnv;
}): UpdateEndpoints | undefined {
  if (options.packaged) return productionEndpoints();
  return developmentEndpoints(options.env[DEV_UPDATE_MANIFEST_ENV]);
}
