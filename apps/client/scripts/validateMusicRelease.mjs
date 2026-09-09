import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST_FILE,
  isSha256,
} from './musicAssetContract.mjs';
import {
  assetRoot,
  validateGameplayMusicAssets,
} from './validateGameplayMusicAssets.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', '..');
export const humanAcceptancePath = path.join(
  repositoryRoot,
  'project-document',
  'ui-ux-overhaul',
  'V1_AUDIO_HUMAN_ACCEPTANCE.json',
);

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function hashFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function validateMusicRelease({
  assetDirectory = assetRoot,
  acceptanceFile = humanAcceptancePath,
} = {}) {
  const technical = await validateGameplayMusicAssets(assetDirectory);
  if (technical.errors.length) {
    return {
      pass: false,
      reason: 'TECHNICAL AUDIO FAILURE',
      technical,
      message: `${technical.errors.join('\n')}`,
    };
  }

  let acceptance;
  try {
    acceptance = JSON.parse(await readFile(acceptanceFile, 'utf8'));
  } catch (error) {
    return {
      pass: false,
      reason: 'HUMAN AUDIO ACCEPTANCE PENDING',
      technical,
      message: `Acceptance record unavailable: ${errorMessage(error)}`,
    };
  }
  if (!acceptance || acceptance.schemaVersion !== 1 || acceptance.accepted !== true) {
    return {
      pass: false,
      reason: 'HUMAN AUDIO ACCEPTANCE PENDING',
      technical,
      message: 'Human acceptance record is not accepted:true.',
    };
  }
  if (!isSha256(acceptance.assetManifestSha256)) {
    return {
      pass: false,
      reason: 'HUMAN AUDIO ACCEPTANCE PENDING',
      technical,
      message: 'Accepted audio must contain a lowercase manifest SHA-256.',
    };
  }
  if (typeof acceptance.reviewedAt !== 'string' || !Number.isFinite(Date.parse(acceptance.reviewedAt))) {
    return {
      pass: false,
      reason: 'HUMAN AUDIO ACCEPTANCE PENDING',
      technical,
      message: 'Accepted audio must contain a valid reviewedAt timestamp.',
    };
  }
  if (typeof acceptance.reviewer !== 'string' || acceptance.reviewer.trim() === '') {
    return {
      pass: false,
      reason: 'HUMAN AUDIO ACCEPTANCE PENDING',
      technical,
      message: 'Accepted audio must identify a reviewer.',
    };
  }
  const manifestSha256 = await hashFile(path.join(assetDirectory, MANIFEST_FILE));
  if (acceptance.assetManifestSha256 !== manifestSha256) {
    return {
      pass: false,
      reason: 'HUMAN AUDIO ACCEPTANCE PENDING',
      technical,
      message: `Acceptance manifest SHA-256 ${acceptance.assetManifestSha256} does not match released ${manifestSha256}.`,
    };
  }
  return { pass: true, reason: 'AUDIO ENGINEERING PASS + HUMAN AUDIO ACCEPTANCE PASS', technical, manifestSha256 };
}

export function formatMusicReleaseResult(result) {
  return `${result.reason}\n${result.message ?? ''}`.trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateMusicRelease();
  if (result.pass) process.stdout.write(`${result.reason}\n`);
  else process.stderr.write(`${formatMusicReleaseResult(result)}\n`);
  process.exitCode = result.pass ? 0 : 1;
}
