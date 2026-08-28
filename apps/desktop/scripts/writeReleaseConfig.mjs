import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertCanonicalReleaseMetadata,
  releaseConfigPath,
  repositoryRoot,
} from './releaseMetadata.mjs';

const metadata = assertCanonicalReleaseMetadata({
  root: repositoryRoot,
  requireEndpoint: process.env.OWN_THE_BLOCK_RELEASE_BUILD === '1',
});
const configPath = releaseConfigPath(repositoryRoot);
const config = {
  version: metadata.version,
  ...(metadata.endpoint ? { socketUrl: metadata.endpoint } : {}),
};

await mkdir(path.dirname(configPath), { recursive: true });
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(
  metadata.endpoint
    ? 'Generated release-config.json with the supplied release endpoint.'
    : 'Generated release-config.json without an endpoint for a non-release package sanity build.',
);
