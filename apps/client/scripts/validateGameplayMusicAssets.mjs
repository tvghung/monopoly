import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(clientRoot, 'public', 'audio', 'music', 'gameplay');
const stemNames = [
  'gameplay-foundation.ogg',
  'gameplay-city.ogg',
  'gameplay-wealth.ogg',
  'gameplay-competition.ogg',
];

const missing = [];
for (const stemName of stemNames) {
  try {
    await access(path.join(assetRoot, stemName));
  } catch {
    missing.push(path.join('apps', 'client', 'public', 'audio', 'music', 'gameplay', stemName));
  }
}

if (missing.length > 0) {
  process.stderr.write('Gameplay rendered music assets are missing. Expected:\n');
  missing.forEach(file => process.stderr.write(`- ${file}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write('Gameplay rendered music assets are present.\n');
}
