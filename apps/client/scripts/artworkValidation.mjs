import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * The checks shared by the card-art and landmark-art validators: every expected SVG exists, is safe (no script, text,
 * foreignObject, raster image, href or external URL) and has the agreed viewBox; no other file is present; and, with a build
 * directory, every built copy is byte-identical to its source and nothing extra was built.
 */

export async function listFiles(root, current = root) {
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

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const errorMessage = error => error?.code === 'ENOENT'
  ? 'missing or empty file'
  : error instanceof Error ? error.message : String(error);

export async function inspectSvg(directory, relative, viewBox) {
  const file = path.join(directory, ...relative.split('/'));
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size === 0) throw new Error('missing or empty file');
  const source = await readFile(file, 'utf8');
  if (!/^\s*<svg\b/iu.test(source)) throw new Error('not an SVG document');
  if (!new RegExp(`\\bviewBox\\s*=\\s*["']${viewBox}["']`, 'iu').test(source)) {
    throw new Error(`viewBox must be exactly ${viewBox}`);
  }
  const withoutSvgNamespace = source.replace(
    /\bxmlns\s*=\s*["']https?:\/\/www\.w3\.org\/2000\/svg["']/iu,
    '',
  );
  if (/https?:\/\//iu.test(withoutSvgNamespace)) throw new Error('external URL is not allowed');
  if (/<(?:script|text|foreignObject|image)\b/iu.test(source)) {
    throw new Error('script, text, foreignObject, and raster image content are not allowed');
  }
  if (/\b(?:href|xlink:href)\s*=/iu.test(source) || /data:image\//iu.test(source)) {
    throw new Error('external or raster content is not allowed');
  }
  return { bytes: metadata.size, sha256: digest(await readFile(file)) };
}

/**
 * Validates one artwork set. `expected` lists `{ relative, ... }` entries (paths below `sourceDirectory`); `buildRoot` is the
 * folder of the set inside a build output (for example `art/cards`).
 */
export async function validateArtworkSet({ expected, sourceDirectory, buildDirectory, buildRoot, viewBox }) {
  const expectedSet = new Set(expected.map(file => file.relative));
  const report = { schemaVersion: 1, expected: expected.length, files: [], errors: [] };
  const sourceFiles = await listFiles(sourceDirectory);
  for (const file of expected) {
    try {
      const inspected = await inspectSvg(sourceDirectory, file.relative, viewBox);
      report.files.push({ ...file, ...inspected });
    } catch (error) {
      report.errors.push(`${file.relative}: ${errorMessage(error)}`);
    }
  }
  for (const file of sourceFiles) {
    if (!expectedSet.has(file)) report.errors.push(`${file}: orphan artwork file`);
  }

  if (buildDirectory) {
    const buildArtworkDirectory = path.join(buildDirectory, buildRoot);
    for (const file of expected) {
      try {
        const source = report.files.find(candidate => candidate.relative === file.relative);
        const built = await inspectSvg(buildArtworkDirectory, file.relative, viewBox);
        if (source && source.sha256 !== built.sha256) {
          report.errors.push(`${file.relative}: build output differs from source artwork`);
        }
      } catch (error) {
        report.errors.push(`${file.relative}: build output ${errorMessage(error)}`);
      }
    }
    const buildFiles = await listFiles(buildArtworkDirectory);
    for (const file of buildFiles) {
      if (!expectedSet.has(file)) report.errors.push(`${buildRoot}/${file}: orphan build artwork file`);
    }
  }
  return report;
}

/**
 * The command line of a validator: `[--build-output] [--report path.json]`. It only runs when the script is the entry point,
 * so tests and the desktop proof can import the validator without side effects.
 */
export async function runArtworkCli({ scriptUrl, scriptName, label, clientRoot, validate }) {
  if (!process.argv[1] || path.resolve(process.argv[1]) !== fileURLToPath(scriptUrl)) return;
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf('--report');
  const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;
  const remaining = args.filter((_, index) => index !== reportIndex && (reportIndex < 0 || index !== reportIndex + 1));
  if ((reportIndex >= 0 && (!reportPath || reportPath.startsWith('--'))) || remaining.some(arg => arg !== '--build-output')) {
    process.stderr.write(`Usage: node scripts/${scriptName} [--build-output] [--report path.json]\n`);
    process.exitCode = 1;
    return;
  }
  const report = await validate({
    buildDirectory: args.includes('--build-output') ? path.join(clientRoot, 'dist') : undefined,
  });
  if (reportPath) await writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
  for (const error of report.errors) process.stderr.write(`[FAIL] ${error}\n`);
  if (!report.errors.length) process.stdout.write(`[PASS] ${report.expected} ${label} and build copies validated.\n`);
  process.exitCode = report.errors.length ? 1 : 0;
}
