import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  artworkRoot,
  validateCardArtwork,
} from '../../client/scripts/validateCardArtwork.mjs';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(desktopRoot, 'out');
const packageEntries = await readdir(outRoot, { withFileTypes: true });
const platformToken = process.platform === 'win32' ? 'win32-' : 'darwin-';
const packageEntry = packageEntries.find(entry => (
  entry.isDirectory() && entry.name.startsWith(`Own the Block-${platformToken}`)
));
if (!packageEntry) throw new Error('No packaged Own the Block application was found in apps/desktop/out');

const packageRoot = path.join(outRoot, packageEntry.name);
const rendererCandidates = process.platform === 'darwin'
  ? [path.join(packageRoot, 'Own the Block.app', 'Contents', 'Resources', 'dist')]
  : [path.join(packageRoot, 'resources', 'dist')];
const rendererRoot = rendererCandidates.find(candidate => (
  existsSync(path.join(candidate, 'art', 'cards'))
));
if (!rendererRoot) throw new Error(`Packaged renderer card artwork was not found under ${packageRoot}`);

const report = await validateCardArtwork({ sourceDirectory: artworkRoot, buildDirectory: rendererRoot });
if (report.errors.length) throw new Error(report.errors.join('\n'));
console.log(`[PASS] ${report.expected} card artworks verified in packaged renderer: ${rendererRoot}`);
