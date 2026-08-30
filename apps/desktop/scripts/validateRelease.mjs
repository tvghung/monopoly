import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertCanonicalReleaseMetadata,
  readGeneratedReleaseConfig,
  repositoryRoot,
  resolveReleaseTarget,
  signingStatus,
} from './releaseMetadata.mjs';

const argumentsSet = new Set(process.argv.slice(2));
const target = resolveReleaseTarget();
const metadata = assertCanonicalReleaseMetadata({
  root: repositoryRoot,
});
const generatedConfig = readGeneratedReleaseConfig(repositoryRoot);

if (generatedConfig.version !== metadata.version) {
  throw new Error(
    `Generated release configuration version drift: expected ${metadata.version}, found ${String(generatedConfig.version)}.`,
  );
}
if (metadata.endpoint !== undefined && generatedConfig.socketUrl !== metadata.endpoint) {
  throw new Error('Generated release configuration does not contain the validated release endpoint.');
}
if (metadata.endpoint === undefined && Object.hasOwn(generatedConfig, 'socketUrl')) {
  throw new Error('Generated release configuration must omit socketUrl when no endpoint was supplied.');
}

const signing = signingStatus({
  platform: target.platform,
  environment: process.env,
});
let artifactManifest;
if (argumentsSet.has('--artifacts')) {
  const manifestPath = path.join(
    repositoryRoot,
    'apps',
    'desktop',
    'out',
    'release-artifacts',
    'manifest.json',
  );
  artifactManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (artifactManifest.version !== metadata.version
    || artifactManifest.platform !== target.platform
    || artifactManifest.architecture !== target.architecture
    || artifactManifest.artifacts?.length === 0) {
    throw new Error('Release artifact metadata is missing the canonical version or artifacts.');
  }
  for (const artifact of artifactManifest.artifacts) {
    const bytes = await readFile(path.join(repositoryRoot, artifact.path));
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (checksum !== artifact.sha256) throw new Error(`Artifact checksum mismatch: ${artifact.path}.`);
  }
}

console.log(JSON.stringify({
  version: metadata.version,
  productName: metadata.productName,
  executableName: metadata.executableName,
  endpointConfigured: Boolean(metadata.endpoint),
  signing,
  artifactsValidated: Boolean(artifactManifest),
}, null, 2));
