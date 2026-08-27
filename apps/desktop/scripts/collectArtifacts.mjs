import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertCanonicalReleaseMetadata,
  repositoryRoot,
  signingStatus,
} from './releaseMetadata.mjs';

const makeRoot = path.join(repositoryRoot, 'apps', 'desktop', 'out', 'make');
const artifactRoot = path.join(repositoryRoot, 'apps', 'desktop', 'out', 'release-artifacts');
const artifactPattern = /\.(?:exe|nupkg|dmg|zip|pkg|msi|blockmap)$/i;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else if (entry.isFile() && (artifactPattern.test(entry.name) || entry.name === 'RELEASES')) {
      files.push(entryPath);
    }
  }
  return files;
}

const metadata = assertCanonicalReleaseMetadata({
  root: repositoryRoot,
  requireEndpoint: true,
});
const files = await listFiles(makeRoot);
if (files.length === 0) throw new Error(`No distributable artifacts found under ${makeRoot}.`);

const artifacts = [];
for (const filePath of files.sort()) {
  const bytes = await readFile(filePath);
  const fileStats = await stat(filePath);
  artifacts.push({
    path: path.relative(repositoryRoot, filePath).replaceAll(path.sep, '/'),
    bytes: fileStats.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

const signing = signingStatus({
  platform: process.env.OWN_THE_BLOCK_RELEASE_PLATFORM || process.platform,
});
const manifest = {
  version: metadata.version,
  productName: metadata.productName,
  executableName: metadata.executableName,
  platform: process.env.OWN_THE_BLOCK_RELEASE_PLATFORM || process.platform,
  architecture: process.env.OWN_THE_BLOCK_RELEASE_ARCH || process.arch,
  signing,
  artifacts,
};

await mkdir(artifactRoot, { recursive: true });
await writeFile(
  path.join(artifactRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(artifactRoot, 'SHA256SUMS'),
  `${artifacts.map(artifact => `${artifact.sha256}  ${artifact.path}`).join('\n')}\n`,
  'utf8',
);
console.log(`Collected metadata for ${artifacts.length} distributable artifact(s).`);
