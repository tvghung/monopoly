import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pinned official release and SHA-256 values from
// https://github.com/cloudflare/cloudflared/releases/tag/2026.9.3
const version = '2026.9.3';
const assets = {
  'win32-x64': ['cloudflared-windows-amd64.exe', 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2'],
  'darwin-x64': ['cloudflared-darwin-amd64.tgz', 'ab588b3b4db9cdb4476c30a3db2a72635b1d8327d44741fee6799a0f37b0ec07'],
  'darwin-arm64': ['cloudflared-darwin-arm64.tgz', '5472c1a01c84bc31b3021056a73b4e5774ddddefc572124ea8fdf6c340639f32'],
};

const target = `${process.platform}-${process.arch}`;
const asset = assets[target];
if (!asset) throw new Error(`Cloudflare Tunnel binary is unavailable for ${target}`);
const [name, expectedHash] = asset;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../generated/cloudflared');
const output = path.join(root, target);
const executable = path.join(output, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const hashFile = path.join(output, 'cloudflared.sha256');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const licenseFile = path.join(root, 'LICENSE.cloudflared');
async function prepareLicense() {
  try { if ((await readFile(licenseFile, 'utf8')).includes('Apache License')) return; }
  catch { /* Fetch the release's license text. */ }
  const response = await fetch(`https://raw.githubusercontent.com/cloudflare/cloudflared/${version}/LICENSE`);
  if (!response.ok) throw new Error(`Could not retrieve cloudflared license (${response.status})`);
  const license = await response.text();
  if (!license.includes('Apache License') || !license.includes('Version 2.0')) {
    throw new Error('Unexpected cloudflared license text');
  }
  await mkdir(root, { recursive: true });
  await writeFile(licenseFile, license);
}

let cached = false;
try {
  const existing = await readFile(executable);
  if ((await readFile(hashFile, 'utf8')).trim() === sha256(existing)) {
    await prepareLicense();
    cached = true;
  }
} catch { /* Download a fresh verified copy. */ }

if (!cached) {
  const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${version}/${name}`);
  if (!response.ok) throw new Error(`Could not download official cloudflared asset (${response.status})`);
  const downloaded = Buffer.from(await response.arrayBuffer());
  if (sha256(downloaded) !== expectedHash) throw new Error('Official cloudflared asset checksum mismatch');

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  if (process.platform === 'win32') {
    await writeFile(executable, downloaded);
  } else {
    const archive = path.join(output, name);
    await writeFile(archive, downloaded);
    execFileSync('tar', ['-xzf', archive, '-C', output, 'cloudflared'], { stdio: 'inherit' });
    await rm(archive);
    await chmod(executable, 0o755);
  }
  await writeFile(hashFile, `${sha256(await readFile(executable))}\n`);
}
await prepareLicense();
console.log(`${cached ? 'Verified cached' : 'Prepared verified'} cloudflared ${version} for ${target}`);
