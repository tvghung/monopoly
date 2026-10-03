import { existsSync } from 'node:fs';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findPackagedApplication } from './packagedRenderer.mjs';
import { KEPT_ELECTRON_LOCALES } from './pruneElectronLocales.mjs';
import { REQUIRED_POSTGRES_BINARIES, shouldShipPostgresFile } from './postgresRuntimeFilter.mjs';

// Size gate for the packaged desktop app: proves the packaging stays lean (no duplicate PostgreSQL inside
// app.asar, pruned PostgreSQL and Electron locales) and that the installers a player downloads stay within budget.
// It prints the size table either way, so every Desktop Build log records what a player downloads.

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  postgresResources,
}) {
  const errors = [];
  const rows = [];

  const appFiles = await walkFiles(packageRoot);
  rows.push(['Packaged application (unpacked)', total(appFiles)]);

  const asarPath = path.join(resourcesRoot, 'app.asar');
  const asarBytes = (await stat(asarPath)).size;
  rows.push(['resources/app.asar', asarBytes]);
  if (asarBytes > ASAR_MAX_BYTES) errors.push(`app.asar is ${mib(asarBytes)}, above ${mib(ASAR_MAX_BYTES)}`);
  const asarRoots = new Set((await readAsarEntries(asarPath)).map(entry => entry.path.split('/')[0]));
  for (const forbidden of ASAR_FORBIDDEN_ROOTS) {
    if (asarRoots.has(forbidden)) errors.push(`app.asar contains ${forbidden}/, which must not be packed into the app`);
  }

  const targetKey = `${platform}-${architecture}`;
  const target = postgresResources.targets[targetKey];
  const postgresRoot = path.join(resourcesRoot, 'postgres', targetKey);
  const postgresFiles = await walkFiles(postgresRoot);
  rows.push([`resources/postgres/${targetKey}`, total(postgresFiles)]);
  const leaked = postgresFiles.filter(file => !shouldShipPostgresFile(file.path, target?.runtimeExclude ?? []));
  if (leaked.length) {
    errors.push(`resources/postgres ships ${leaked.length} excluded file(s), for example ${leaked[0].path}`);
  }
  const extension = platform === 'win32' ? '.exe' : '';
  for (const binary of REQUIRED_POSTGRES_BINARIES) {
    if (!existsSync(path.join(postgresRoot, 'bin', `${binary}${extension}`))) {
      errors.push(`resources/postgres is missing the required bin/${binary}${extension}`);
    }
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
  const postgresResources = JSON.parse(await readFile(path.join(desktopRoot, 'postgres-resources.json'), 'utf8'));
  const { rows, errors } = await checkPackagedBudget({ ...application, postgresResources });
  for (const [label, bytes] of rows) console.log(`${mib(bytes).padStart(12)}  ${label}`);
  if (errors.length) {
    for (const error of errors) console.error(`[FAIL] ${error}`);
    process.exit(1);
  }
  console.log('[PASS] Packaged size budget holds.');
}
