import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findPackagedApplication } from './packagedRenderer.mjs';
import { KEPT_ELECTRON_LOCALES } from './pruneElectronLocales.mjs';

/** The pinned cloudflared digests: the only trusted reference for the tunnel executable that ships in the package. */
export async function loadCloudflaredIntegrity() {
  return JSON.parse(await readFile(new URL('../cloudflared-integrity.json', import.meta.url), 'utf8'));
}

// Size gate for the packaged desktop app and bundled tunnel helper.
// It prints the size table either way, so every Desktop Build log records what a player downloads.

const MIB = 1048576;

/** app.asar holds only the compiled main/preload code and package.json. */
export const ASAR_MAX_BYTES = 5 * MIB;
export const ASAR_FORBIDDEN_ROOTS = ['generated', 'src', 'tests', 'scripts', 'node_modules', 'out'];
/**
 * What a player downloads. Windows `Setup.exe`: 249.7 MiB originally, 181.9 MiB after the duplicate PostgreSQL copy, the
 * link-time libraries and the extra Electron locales were removed, 160.6 MiB once the music shipped as Ogg Vorbis instead
 * of WAV. macOS `.dmg` (Apple silicon): 378.1 MiB originally, 236.2 MiB with those changes, 173 MiB with LZMA (ULMO)
 * compression instead of LZFSE. Each budget leaves headroom of 10 percent or more.
 */
export const INSTALLER_BUDGETS = [
  { label: 'Windows Setup.exe', pattern: /Setup\.exe$/i, maxBytes: 175 * MIB },
  { label: 'macOS DMG', pattern: /\.dmg$/i, maxBytes: 195 * MIB },
];

/** Budget violations of installer files given as `{ path, size }`. */
export function installerBudgetErrors(installers) {
  const errors = [];
  for (const installer of installers) {
    const budget = INSTALLER_BUDGETS.find(candidate => candidate.pattern.test(installer.path));
    if (budget && installer.size > budget.maxBytes) {
      errors.push(
        `${path.posix.basename(installer.path)} is ${mib(installer.size)}, above the ${mib(budget.maxBytes)} ${budget.label} budget`,
      );
    }
  }
  return errors;
}

/** Lists the files of an asar archive with their sizes, from its header (no dependency on @electron/asar). */
export async function readAsarEntries(asarPath) {
  const handle = await open(asarPath, 'r');
  try {
    const prefix = Buffer.alloc(16);
    await handle.read(prefix, 0, 16, 0);
    // Chromium pickle: [4][header pickle size] then the header pickle [payload size][string length][JSON].
    const jsonLength = prefix.readUInt32LE(12);
    const json = Buffer.alloc(jsonLength);
    await handle.read(json, 0, jsonLength, 16);
    const header = JSON.parse(json.toString('utf8'));
    const entries = [];
    const walk = (node, prefixPath) => {
      for (const [name, child] of Object.entries(node.files ?? {})) {
        const entryPath = prefixPath ? `${prefixPath}/${name}` : name;
        if (child.files) walk(child, entryPath);
        else entries.push({ path: entryPath, size: Number(child.size ?? 0) });
      }
    };
    walk(header, '');
    return entries;
  } finally {
    await handle.close();
  }
}

async function walkFiles(root, base = root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(entryPath, base));
    else if (entry.isFile()) {
      files.push({ path: path.relative(base, entryPath).replaceAll(path.sep, '/'), size: (await stat(entryPath)).size });
    }
  }
  return files;
}

const total = files => files.reduce((sum, file) => sum + file.size, 0);
const mib = bytes => `${(bytes / MIB).toFixed(1)} MiB`;

/** Checks one packaged application; returns the size rows and every budget violation. */
export async function checkPackagedBudget({
  packageRoot,
  resourcesRoot,
  outRoot,
  platform = process.platform,
  architecture = process.arch,
  integrity,
}) {
  const cloudflaredIntegrity = integrity ?? await loadCloudflaredIntegrity();
  const errors = [];
  const rows = [];

  const appFiles = await walkFiles(packageRoot);
  rows.push(['Packaged application (unpacked)', total(appFiles)]);

  const asarPath = path.join(resourcesRoot, 'app.asar');
  const asarBytes = (await stat(asarPath)).size;
  rows.push(['resources/app.asar', asarBytes]);
  if (asarBytes > ASAR_MAX_BYTES) errors.push(`app.asar is ${mib(asarBytes)}, above ${mib(ASAR_MAX_BYTES)}`);
  const asarEntries = await readAsarEntries(asarPath);
  const asarRoots = new Set(asarEntries.map(entry => entry.path.split('/')[0]));
  // The compiled main process requires the pinned digests at start-up; the packager ignore list must keep this file.
  if (!asarEntries.some(entry => entry.path === 'cloudflared-integrity.json')) {
    errors.push('app.asar is missing cloudflared-integrity.json, which the main process requires to verify the tunnel');
  }
  for (const forbidden of ASAR_FORBIDDEN_ROOTS) {
    if (asarRoots.has(forbidden)) errors.push(`app.asar contains ${forbidden}/, which must not be packed into the app`);
  }

  const targetKey = `${platform}-${architecture}`;
  const pinnedTunnelHash = cloudflaredIntegrity.assets[targetKey]?.executableSha256;
  if (!pinnedTunnelHash) errors.push(`Unsupported cloudflared target ${targetKey}`);
  if (existsSync(path.join(resourcesRoot, 'postgres'))) errors.push('Obsolete PostgreSQL runtime is bundled');
  const tunnelRoot = path.join(resourcesRoot, 'cloudflared', targetKey);
  const tunnelBinary = path.join(tunnelRoot, platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (!existsSync(tunnelBinary)) errors.push(`Bundled cloudflared binary is missing for ${targetKey}`);
  else {
    const digestFile = path.join(tunnelRoot, 'cloudflared.sha256');
    if (!existsSync(digestFile)) errors.push(`Bundled cloudflared verification digest is missing for ${targetKey}`);
    else {
      const expected = (await readFile(digestFile, 'utf8')).trim();
      const actual = createHash('sha256').update(await readFile(tunnelBinary)).digest('hex');
      if (actual !== expected || actual !== pinnedTunnelHash) errors.push(`Bundled cloudflared verification digest failed for ${targetKey}`);
    }
    rows.push([`resources/cloudflared/${targetKey}`, total(await walkFiles(tunnelRoot))]);
  }
  const tunnelLicense = path.join(resourcesRoot, 'cloudflared', 'LICENSE.cloudflared');
  if (!existsSync(tunnelLicense)
    || createHash('sha256').update(await readFile(tunnelLicense)).digest('hex') !== cloudflaredIntegrity.licenseSha256) {
    errors.push('Bundled cloudflared license is missing or does not match its pinned digest');
  }

  for (const folder of ['dist', 'server-helper']) {
    rows.push([`resources/${folder}`, total(await walkFiles(path.join(resourcesRoot, folder)))]);
  }

  if (platform !== 'darwin') {
    const locales = (await readdir(path.join(packageRoot, 'locales'))).filter(name => name.endsWith('.pak'));
    rows.push([`locales (${locales.length} files)`, total(appFiles.filter(file => file.path.startsWith('locales/')))]);
    const expected = KEPT_ELECTRON_LOCALES.map(locale => `${locale}.pak`).sort();
    if (locales.sort().join(',') !== expected.join(',')) {
      errors.push(`locales/ holds ${locales.join(', ')}; expected exactly ${expected.join(', ')}`);
    }
  }

  const makeRoot = path.join(outRoot, 'make');
  if (existsSync(makeRoot)) {
    const installers = (await walkFiles(makeRoot)).filter(file => /(?:Setup\.exe|\.dmg)$/i.test(file.path));
    for (const installer of installers) rows.push([`installer ${path.posix.basename(installer.path)}`, installer.size]);
    errors.push(...installerBudgetErrors(installers));
  }

  return { rows, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const application = await findPackagedApplication();
  const { rows, errors } = await checkPackagedBudget(application);
  for (const [label, bytes] of rows) console.log(`${mib(bytes).padStart(12)}  ${label}`);
  if (errors.length) {
    for (const error of errors) console.error(`[FAIL] ${error}`);
    process.exit(1);
  }
  console.log('[PASS] Packaged size budget holds.');
}
