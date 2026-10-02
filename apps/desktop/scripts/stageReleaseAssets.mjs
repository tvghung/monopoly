import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Stages the files of a GitHub Release from the artifacts that the Release Candidate workflow
// uploaded (one directory per target). Only the installers a player needs are staged, under
// names that carry the version and the target, next to one SHA256SUMS.txt. Every installer is
// checked against the manifest that `collectArtifacts.mjs` wrote in the same build job, so a
// missing, doubled, stale or altered file fails here instead of reaching the release page.

export const CHECKSUM_FILE_NAME = 'SHA256SUMS.txt';
const MANIFEST_FILE_NAME = 'manifest.json';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

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

function sha256Of(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

export async function stageReleaseAssets({ artifactsDirectory, outputDirectory, version }) {
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

    const installers = files.filter(filePath => target.isInstaller(path.basename(filePath)));
    if (installers.length !== 1) {
      throw new Error(`${target.label}: expected exactly one installer in ${target.artifact}, found ${installers.length}.`);
    }
    const [source] = installers;
    const sourceName = path.basename(source);
    const listed = (manifest.artifacts ?? []).find(artifact => path.posix.basename(artifact.path) === sourceName);
    if (!listed) throw new Error(`${target.label}: ${sourceName} is not listed in ${MANIFEST_FILE_NAME}.`);
    const sha256 = await sha256Of(source);
    if (sha256 !== listed.sha256) {
      throw new Error(`${target.label}: ${sourceName} does not match the checksum recorded by its build job.`);
    }

    const destination = path.join(outputDirectory, target.assetName);
    await copyFile(source, destination);
    staged.push({
      label: target.label,
      name: target.assetName,
      bytes: (await stat(destination)).size,
      sha256,
      signing: manifest.signing?.signing ?? 'UNKNOWN',
    });
  }

  await writeFile(
    path.join(outputDirectory, CHECKSUM_FILE_NAME),
    `${staged.map(asset => `${asset.sha256}  ${asset.name}`).join('\n')}\n`,
    'utf8',
  );
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
      console.log(`${asset.name}  ${(asset.bytes / 1024 / 1024).toFixed(1)} MiB  signing ${asset.signing}  sha256 ${asset.sha256}`);
    }
    console.log(`Staged ${staged.length} installer(s) and ${CHECKSUM_FILE_NAME}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
