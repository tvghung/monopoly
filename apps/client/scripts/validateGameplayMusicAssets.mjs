import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const assetRoot = path.join(clientRoot, 'public', 'audio');
export const MUSIC_ASSET_PATH = 'music/own-the-block-main-theme-loop.wav';
export const SFX_ASSET_PATHS = [
  'sfx/dice/dice-shake-01.ogg',
  'sfx/dice/dice-shake-02.ogg',
  'sfx/dice/dice-shake-03.ogg',
  'sfx/dice/dice-impact-01.ogg',
  'sfx/dice/dice-impact-02.ogg',
  'sfx/dice/dice-impact-03.ogg',
  'sfx/movement/movement-land-01.ogg',
  'sfx/movement/movement-land-02.ogg',
  'sfx/movement/movement-land-03.ogg',
  'sfx/money/money-receive-01.ogg',
  'sfx/money/money-receive-02.ogg',
  'sfx/money/money-receive-03.ogg',
  'sfx/money/money-pay-01.ogg',
  'sfx/property/property-purchase-01.ogg',
  'sfx/property/property-purchase-02.ogg',
  'sfx/build/build-house-01.ogg',
  'sfx/build/build-house-02.ogg',
  'sfx/build/build-hotel-01.ogg',
  'sfx/build/build-hotel-02.ogg',
  'sfx/card/card-draw-01.ogg',
  'sfx/card/card-draw-02.ogg',
  'sfx/card/card-draw-03.ogg',
  'sfx/card/card-reveal-01.ogg',
  'sfx/card/card-reveal-02.ogg',
  'sfx/jail/jail-enter-01.ogg',
  'sfx/jail/jail-release-01.ogg',
  'sfx/bankruptcy/bankruptcy-01.ogg',
];
export const EXPECTED_AUDIO_ASSETS = [MUSIC_ASSET_PATH, ...SFX_ASSET_PATHS];

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function listFiles(root, current = root) {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, file));
    else if (entry.isFile()) files.push(path.relative(root, file).split(path.sep).join('/'));
  }
  return files;
}

async function hashFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function inspectFile(directory, relative) {
  const file = path.join(directory, ...relative.split('/'));
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size === 0) throw new Error('missing or empty file');
  return { bytes: metadata.size, sha256: await hashFile(file) };
}

export async function validateGameplayMusicAssets(directory = assetRoot, buildDirectory) {
  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    music: null,
    sfx: [],
    errors: [],
    warnings: [],
  };
  const files = await listFiles(directory);
  for (const relative of EXPECTED_AUDIO_ASSETS) {
    try {
      const inspected = await inspectFile(directory, relative);
      if (relative === MUSIC_ASSET_PATH) report.music = { path: relative, ...inspected };
      else report.sfx.push({ path: relative, ...inspected });
    } catch (error) {
      report.errors.push(`${relative}: ${errorMessage(error)}`);
    }
  }
  for (const file of files) {
    if (file.startsWith('music/gameplay/') || /(?:gameplay-(?:foundation|city|wealth|competition)|gameplay-music\.manifest)\./u.test(file)) {
      report.errors.push(`${file}: obsolete segmented music asset`);
    }
  }

  if (buildDirectory) {
    for (const relative of EXPECTED_AUDIO_ASSETS) {
      try {
        const source = await inspectFile(directory, relative);
        const output = await inspectFile(buildDirectory, relative);
        if (source.sha256 !== output.sha256) report.errors.push(`${relative}: client build output differs from source asset`);
      } catch (error) {
        report.errors.push(`${relative}: client build output ${errorMessage(error)}`);
      }
    }
  }
  return report;
}

function usage() {
  process.stderr.write('Usage: node scripts/validateGameplayMusicAssets.mjs [--build-output] [--report path.json]\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf('--report');
  const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;
  const remaining = args.filter((_, index) => index !== reportIndex && (reportIndex < 0 || index !== reportIndex + 1));
  if ((reportIndex >= 0 && (!reportPath || reportPath.startsWith('--'))) || remaining.some(arg => arg !== '--build-output')) {
    usage();
    process.exitCode = 1;
  } else {
    const report = await validateGameplayMusicAssets(
      assetRoot,
      args.includes('--build-output') ? path.join(clientRoot, 'dist', 'audio') : undefined,
    );
    if (reportPath) await writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
    for (const warning of report.warnings) process.stdout.write(`[WARN] ${warning}\n`);
    for (const error of report.errors) process.stderr.write(`[FAIL] ${error}\n`);
    if (!report.errors.length) process.stdout.write(`[PASS] ${EXPECTED_AUDIO_ASSETS.length} production audio assets and build hashes validated. Human listening remains separate.\n`);
    process.exitCode = report.errors.length ? 1 : 0;
  }
}
