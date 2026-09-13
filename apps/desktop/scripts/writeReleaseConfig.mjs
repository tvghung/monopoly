import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertCanonicalReleaseMetadata,
  releaseConfigPath,
  repositoryRoot,
} from './releaseMetadata.mjs';

const metadata = assertCanonicalReleaseMetadata({
  root: repositoryRoot,
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
    : 'Generated release-config.json without a configured endpoint for a LAN-first release.',
);
