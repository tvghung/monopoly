import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Prepares the cloudflared executable that ships inside the app. Trust comes from the pinned manifest
// (cloudflared-integrity.json): the digest of the official download, the digest of the executable inside it, and
// the digest of the license text. Nothing stored beside the cached files is ever consulted for trust.

const HEX_SHA256 = /^[a-f0-9]{64}$/u;
const sha256 = data => createHash('sha256').update(data).digest('hex');

export function pinnedAsset(manifest, target) {
  const asset = manifest?.assets?.[target];
  if (!asset) throw new Error(`Cloudflare Tunnel binary is unavailable for ${target}`);
  if (typeof asset.name !== 'string' || !/^[A-Za-z0-9._-]+$/u.test(asset.name)
    || !HEX_SHA256.test(asset.archiveSha256 ?? '') || !HEX_SHA256.test(asset.executableSha256 ?? '')) {
    throw new Error(`Pinned cloudflared digests for ${target} are incomplete`);
  }
  if (typeof manifest.version !== 'string' || !/^[0-9][0-9A-Za-z.-]*$/u.test(manifest.version)
    || !HEX_SHA256.test(manifest.licenseSha256 ?? '')) {
    throw new Error('Pinned cloudflared version or license digest is incomplete');
  }
  return asset;
}

export async function defaultDownload(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Extracts only the `cloudflared` member; the archive was verified against its pinned digest first. */
export function defaultExtract(archive, directory) {
  execFileSync('tar', ['-xzf', archive, '-C', directory, 'cloudflared'], { stdio: 'inherit' });
}

async function readIfPresent(file) {
  try { return await readFile(file); } catch { return undefined; }
}

/**
 * Leaves `<root>/<target>` holding the verified executable, or nothing: an existing copy that does not match
 * the pinned digest (modified, truncated, or accompanied by a rewritten checksum file) is removed and replaced
 * from the official release, and a download that does not verify is discarded before anything is written.
 */
export async function prepareCloudflared({
  manifest,
  root,
  platform = process.platform,
  arch = process.arch,
  download = defaultDownload,
  extract = defaultExtract,
  log = () => undefined,
}) {
  const target = `${platform}-${arch}`;
  const asset = pinnedAsset(manifest, target);
  const output = path.join(root, target);
  const executable = path.join(output, platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  // Informational record for build logs and the packaged-size check; it carries no trust.
  const hashFile = path.join(output, 'cloudflared.sha256');
  const licenseFile = path.join(root, 'LICENSE.cloudflared');

  async function prepareLicense() {
    const existing = await readIfPresent(licenseFile);
    if (existing && sha256(existing) === manifest.licenseSha256) return;
    const license = await download(`https://raw.githubusercontent.com/cloudflare/cloudflared/${manifest.version}/LICENSE`);
    if (sha256(license) !== manifest.licenseSha256) throw new Error('Official cloudflared license checksum mismatch');
    await mkdir(root, { recursive: true });
    await writeFile(licenseFile, license);
  }

  const existing = await readIfPresent(executable);
  if (existing && sha256(existing) === asset.executableSha256) {
    if (platform !== 'win32') await chmod(executable, 0o755);
    await writeFile(hashFile, `${asset.executableSha256}\n`);
    await prepareLicense();
    log(`Verified cached cloudflared ${manifest.version} for ${target}`);
    return { status: 'cached', target, executable };
  }
  if (existing) log(`Cached cloudflared for ${target} does not match its pinned digest; replacing it`);
  // Whatever is there is not the pinned build: never leave it behind, even if the replacement fails.
  await rm(output, { recursive: true, force: true });

  const downloaded = await download(
    `https://github.com/cloudflare/cloudflared/releases/download/${manifest.version}/${asset.name}`,
  );
  if (sha256(downloaded) !== asset.archiveSha256) throw new Error('Official cloudflared asset checksum mismatch');

  await mkdir(output, { recursive: true });
  try {
    if (platform === 'win32') {
      await writeFile(executable, downloaded);
    } else {
      const archive = path.join(output, asset.name);
      await writeFile(archive, downloaded);
      extract(archive, output);
      await rm(archive, { force: true });
      await chmod(executable, 0o755);
    }
    if (sha256(await readFile(executable)) !== asset.executableSha256) {
      throw new Error('Extracted cloudflared executable checksum mismatch');
    }
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
  await writeFile(hashFile, `${asset.executableSha256}\n`);
  await prepareLicense();
  log(`Prepared verified cloudflared ${manifest.version} for ${target}`);
  return { status: 'prepared', target, executable };
}
