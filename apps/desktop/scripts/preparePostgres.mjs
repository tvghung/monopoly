import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(desktopRoot, '../..');
const manifestPath = path.join(desktopRoot, 'postgres-resources.json');
const generatedRoot = path.join(desktopRoot, 'generated', 'postgres');
const targetKey = `${process.platform}-${process.arch}`;
const offline = process.env.OWN_THE_BLOCK_POSTGRES_OFFLINE === '1';

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const target = manifest.targets[targetKey];
if (!target) {
  throw new Error(`No managed PostgreSQL resource manifest entry for ${targetKey}`);
}

function fail(message) {
  throw new Error(`PostgreSQL preparation failed: ${message}`);
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyArchive(archivePath) {
  const archiveStat = await stat(archivePath);
  if (archiveStat.size !== target.archiveBytes) {
    fail(`${path.basename(archivePath)} size ${archiveStat.size} does not match the manifest`);
  }
  const checksum = await hashFile(archivePath);
  if (checksum !== target.sha256) {
    fail(`${path.basename(archivePath)} SHA-256 does not match the manifest`);
  }
}

async function downloadArchive(destination) {
  if (offline) fail(`offline mode requires ${destination}`);
  const response = await fetch(target.source);
  if (!response.ok || !response.body) {
    fail(`download returned HTTP ${response.status}`);
  }
  const partial = `${destination}.part`;
  await rm(partial, { force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  await verifyArchive(partial);
  await rm(destination, { force: true });
  await rename(partial, destination);
}

const overrideArchive = process.env.OWN_THE_BLOCK_POSTGRES_ARCHIVE?.trim();
const cacheRoot = process.env.OWN_THE_BLOCK_POSTGRES_CACHE?.trim()
  || path.join(os.tmpdir(), 'own-the-block', 'postgres-archives');
const archivePath = overrideArchive || path.join(cacheRoot, target.archiveName);
await access(archivePath).catch(async () => {
  if (overrideArchive) fail(`archive override does not exist: ${archivePath}`);
  await downloadArchive(archivePath);
});
if (path.basename(archivePath) !== target.archiveName) {
  fail(`archive must be named ${target.archiveName}`);
}
await verifyArchive(archivePath);

const extractionRoot = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-postgres-'));
try {
  const extraction = spawnSync('tar', ['-xf', archivePath, '-C', extractionRoot], {
    cwd: repositoryRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    windowsHide: true,
  });
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) {
    fail(`archive extraction failed: ${(extraction.stderr || extraction.stdout).trim().slice(-512)}`);
  }

  const sourceRoot = path.join(extractionRoot, target.archiveRoot);
  for (const layout of target.runtimeLayout) await access(path.join(sourceRoot, layout));
  const extension = process.platform === 'win32' ? '.exe' : '';
  const requiredBinaries = ['initdb', 'postgres', 'pg_ctl', 'pg_isready', 'createdb', 'psql'];
  for (const binary of requiredBinaries) await access(path.join(sourceRoot, 'bin', `${binary}${extension}`));
  const licensePath = path.join(sourceRoot, 'server_license.txt');
  await access(licensePath);

  const versionBinary = path.join(sourceRoot, 'bin', `postgres${extension}`);
  const version = spawnSync(versionBinary, ['--version'], {
    cwd: sourceRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    windowsHide: true,
  });
  if (version.error) throw version.error;
  const versionText = `${version.stdout || ''}${version.stderr || ''}`;
  if (version.status !== 0 || !new RegExp(`PostgreSQL\\D+${manifest.postgresMajor}(?:\\.|\\s)`, 'u').test(versionText)) {
    fail(`native postgres --version did not report major ${manifest.postgresMajor}`);
  }

  const outputRoot = path.join(generatedRoot, targetKey);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(generatedRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  for (const layout of target.runtimeLayout) {
    await cp(path.join(sourceRoot, layout), path.join(outputRoot, layout), { recursive: true });
  }
  await cp(licensePath, path.join(outputRoot, 'server_license.txt'));
  await writeFile(
    path.join(outputRoot, 'manifest.json'),
    `${JSON.stringify({ ...target, targetKey, postgresMajor: manifest.postgresMajor }, null, 2)}\n`,
    'utf8',
  );

  console.log(`Prepared managed PostgreSQL ${manifest.postgresVersion} for ${targetKey}`);
} finally {
  await rm(extractionRoot, { recursive: true, force: true });
}
