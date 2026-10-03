import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The packaged Own the Block application of this platform under `apps/desktop/out`: its folder and the
 * `resources` folder that holds app.asar and the extraResource copies.
 */
export async function findPackagedApplication() {
  const outRoot = path.join(desktopRoot, 'out');
  const packageEntries = await readdir(outRoot, { withFileTypes: true });
  const platformToken = process.platform === 'win32' ? 'win32-' : 'darwin-';
  const packageEntry = packageEntries.find(entry => (
    entry.isDirectory() && entry.name.startsWith(`Own the Block-${platformToken}`)
  ));
  if (!packageEntry) throw new Error('No packaged Own the Block application was found in apps/desktop/out');

  const packageRoot = path.join(outRoot, packageEntry.name);
  const resourcesRoot = process.platform === 'darwin'
    ? path.join(packageRoot, 'Own the Block.app', 'Contents', 'Resources')
    : path.join(packageRoot, 'resources');
  return { outRoot, packageRoot, resourcesRoot };
}

/**
 * The renderer folder (`dist`) inside the packaged Own the Block application of this platform, found by a subfolder it must
 * contain (for example `art/cards`). `description` names what is being looked for, for the error message.
 */
export async function findPackagedRendererRoot(requiredSubfolder, description) {
  const { packageRoot, resourcesRoot } = await findPackagedApplication();
  const rendererCandidates = [path.join(resourcesRoot, 'dist')];
  const rendererRoot = rendererCandidates.find(candidate => (
    existsSync(path.join(candidate, ...requiredSubfolder.split('/')))
  ));
  if (!rendererRoot) throw new Error(`Packaged renderer ${description} was not found under ${packageRoot}`);
  return rendererRoot;
}
