import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assetKeyOf,
  buildUpdateManifest,
  readUpdatePolicy,
  SQUIRREL_RELEASES_NAME,
  UPDATE_MANIFEST_FILE_NAME,
} from './updateManifest.mjs';

// Stages the files of a GitHub Release from the artifacts that the Release Candidate workflow
// uploaded (one directory per target). Only the files a player or the in-app updater needs are
// staged, under names that carry the version and the target: the installers, the Windows Squirrel
// feed (RELEASES and the full package), one SHA256SUMS.txt and the update-manifest.json that the
// in-app updater reads (see updateManifest.mjs). Every file is checked against the manifest that
// `collectArtifacts.mjs` wrote in the same build job, so a missing, doubled, stale or altered file
// fails here instead of reaching the release page.

export const CHECKSUM_FILE_NAME = 'SHA256SUMS.txt';
const MANIFEST_FILE_NAME = 'manifest.json';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// `name` of the Squirrel maker in forge.config.cjs; Squirrel names its full package `<name>-<version>-full.nupkg`.
const SQUIRREL_PACKAGE_ID = 'own_the_block';
// A RELEASES line: SHA-1 of the package, its file name, its size.
const RELEASES_LINE_PATTERN = /^([0-9A-Fa-f]{40}) (\S+) (\d+)$/;

export function releaseTargets(version) {
  const setupName = `OwnTheBlock-${version}-win32-x64-Setup.exe`;
  return [
    {
      label: 'Windows x64',
      artifact: 'own-the-block-windows-x64',
      platform: 'win32',
      architecture: 'x64',
      isInstaller: fileName => fileName === setupName,
      assetName: setupName,
      // What an app installed by the Setup.exe updates from: `Update.exe --update=<folder>` reads RELEASES and the package.
      squirrel: {
        releasesName: SQUIRREL_RELEASES_NAME,
        packageName: `${SQUIRREL_PACKAGE_ID}-${version}-full.nupkg`,
      },
    },
    {
      label: 'macOS x64',
      artifact: 'own-the-block-macos-x64',
      platform: 'darwin',
      architecture: 'x64',
      isInstaller: fileName => /\.dmg$/i.test(fileName),
      assetName: `OwnTheBlock-${version}-macos-x64.dmg`,
    },
    {
      label: 'macOS arm64',
      artifact: 'own-the-block-macos-arm64',
      platform: 'darwin',
      architecture: 'arm64',
      isInstaller: fileName => /\.dmg$/i.test(fileName),
      assetName: `OwnTheBlock-${version}-macos-arm64.dmg`,
    },
  ];
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function digestOf(algorithm, filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

const sha256Of = filePath => digestOf('sha256', filePath);

/**
 * The single full package a RELEASES file lists. Squirrel writes the file with a byte order mark and no final newline;
 * both are accepted. More than one line would mean delta packages the release does not carry, which `Update.exe` would
 * go looking for, so it is refused.
 */
export function parseReleasesFile(text) {
  const lines = text.replace(/^\u{feff}/u, '').split(/\r?\n/u).filter(line => line.trim() !== '');
  if (lines.length !== 1) throw new Error(`expected exactly one package line, found ${lines.length}`);
  const match = RELEASES_LINE_PATTERN.exec(lines[0].trim());
  if (!match) throw new Error('the package line is not "<SHA-1> <file name> <size>"');
  return { sha1: match[1].toLowerCase(), name: match[2], size: Number(match[3]) };
}

/**
 * Copies the one file of `files` that `match` selects into the output directory under `assetName`, after checking that it
 * is exactly the file its build job recorded. `what` names the file in the error messages.
 */
async function stageListedFile({ label, artifact, files, what, match, manifest, outputDirectory, assetName }) {
  const found = files.filter(filePath => match(path.basename(filePath)));
  if (found.length !== 1) {
    throw new Error(`${label}: expected exactly one ${what} in ${artifact}, found ${found.length}.`);
  }
  const [source] = found;
  const sourceName = path.basename(source);
  const listed = (manifest.artifacts ?? []).find(entry => path.posix.basename(entry.path) === sourceName);
  if (!listed) throw new Error(`${label}: ${sourceName} is not listed in ${MANIFEST_FILE_NAME}.`);
  const sha256 = await sha256Of(source);
  if (sha256 !== listed.sha256) {
    throw new Error(`${label}: ${sourceName} does not match the checksum recorded by its build job.`);
  }
  const destination = path.join(outputDirectory, assetName);
  await copyFile(source, destination);
  return { source, name: assetName, bytes: (await stat(destination)).size, sha256 };
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function stageReleaseAssets({
  artifactsDirectory,
  outputDirectory,
  version,
  // The release author's one update decision, read from the repository unless a caller supplies it.
  policy = readUpdatePolicy(repositoryRoot),
}) {
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new Error(`Release version must be a semantic version without the leading "v", received ${String(version)}.`);
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const staged = [];
  for (const target of releaseTargets(version)) {
    let files;
    try {
      files = await listFiles(path.join(artifactsDirectory, target.artifact));
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `${target.label}: artifact ${target.artifact} was not downloaded; its build job did not upload it.`,
          { cause: error },
        );
      }
      throw error;
    }

    const manifestPaths = files.filter(filePath => path.basename(filePath) === MANIFEST_FILE_NAME);
    if (manifestPaths.length !== 1) {
      throw new Error(`${target.label}: expected exactly one ${MANIFEST_FILE_NAME} in ${target.artifact}, found ${manifestPaths.length}.`);
    }
    const manifest = JSON.parse(await readFile(manifestPaths[0], 'utf8'));
    if (manifest.version !== version
      || manifest.platform !== target.platform
      || manifest.architecture !== target.architecture) {
      throw new Error(
        `${target.label}: manifest describes ${String(manifest.version)} ${String(manifest.platform)} ${String(manifest.architecture)}, expected ${version} ${target.platform} ${target.architecture}.`,
      );
    }

    const common = { label: target.label, artifact: target.artifact, files, manifest, outputDirectory };
    const installer = await stageListedFile({
      ...common,
      what: 'installer',
      match: target.isInstaller,
      assetName: target.assetName,
    });

    let squirrel;
    let squirrelFiles = [];
    if (target.squirrel) {
      const releases = await stageListedFile({
        ...common,
        what: target.squirrel.releasesName,
        match: fileName => fileName === target.squirrel.releasesName,
        assetName: target.squirrel.releasesName,
      });
      const nupkg = await stageListedFile({
        ...common,
        what: target.squirrel.packageName,
        match: fileName => fileName === target.squirrel.packageName,
        assetName: target.squirrel.packageName,
      });
      // The two files are built together; if they ever disagree, `Update.exe` would refuse the package on the player's machine.
      let line;
      try {
        line = parseReleasesFile(await readFile(releases.source, 'utf8'));
      } catch (error) {
        throw new Error(`${target.label}: ${target.squirrel.releasesName} is not a usable Squirrel feed: ${error.message}.`, { cause: error });
      }
      if (line.name !== nupkg.name || line.size !== nupkg.bytes || line.sha1 !== await digestOf('sha1', nupkg.source)) {
        throw new Error(`${target.label}: ${target.squirrel.releasesName} does not describe ${nupkg.name} (name, size and SHA-1 must match).`);
      }
      squirrel = {
        releases: { name: releases.name, size: releases.bytes, sha256: releases.sha256 },
        package: { name: nupkg.name, size: nupkg.bytes, sha256: nupkg.sha256 },
      };
      squirrelFiles = [releases, nupkg];
    }

    staged.push({
      label: target.label,
      key: assetKeyOf(target.platform, target.architecture),
      name: installer.name,
      bytes: installer.bytes,
      sha256: installer.sha256,
      signing: manifest.signing?.signing ?? 'UNKNOWN',
      ...(squirrel ? { squirrel } : {}),
      // Every file copied for this target, in the order it is listed in SHA256SUMS.txt.
      files: [installer, ...squirrelFiles].map(file => ({ name: file.name, bytes: file.bytes, sha256: file.sha256 })),
    });
  }

  await writeFile(
    path.join(outputDirectory, CHECKSUM_FILE_NAME),
    `${staged.flatMap(asset => asset.files).map(file => `${file.sha256}  ${file.name}`).join('\n')}\n`,
    'utf8',
  );

  // Built last, from the very values just written to SHA256SUMS.txt, so the two can never disagree.
  const manifest = buildUpdateManifest({
    version,
    policy,
    assets: Object.fromEntries(staged.map(asset => [asset.key, {
      name: asset.name,
      size: asset.bytes,
      sha256: asset.sha256,
      ...(asset.squirrel ? { squirrel: asset.squirrel } : {}),
    }])),
  });
  await writeFile(path.join(outputDirectory, UPDATE_MANIFEST_FILE_NAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return staged;
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const staged = await stageReleaseAssets({
      artifactsDirectory: path.resolve(readOption('--artifacts')),
      outputDirectory: path.resolve(readOption('--out')),
      version: readOption('--version'),
    });
    for (const asset of staged) {
      for (const file of asset.files) {
        console.log(`${file.name}  ${(file.bytes / 1024 / 1024).toFixed(1)} MiB  sha256 ${file.sha256}`);
      }
      console.log(`${asset.label}: signing ${asset.signing}`);
    }
    const fileCount = staged.reduce((sum, asset) => sum + asset.files.length, 0);
    console.log(`Staged ${fileCount} file(s) for ${staged.length} target(s), ${CHECKSUM_FILE_NAME} and ${UPDATE_MANIFEST_FILE_NAME}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
