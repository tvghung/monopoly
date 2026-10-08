import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCloudflared } from './cloudflaredBinary.mjs';

// Pinned archive, executable and license digests live in cloudflared-integrity.json, never in the cache directory.
const manifest = JSON.parse(await readFile(new URL('../cloudflared-integrity.json', import.meta.url), 'utf8'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../generated/cloudflared');

await prepareCloudflared({ manifest, root, log: console.log });
