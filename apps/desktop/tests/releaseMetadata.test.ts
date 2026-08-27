import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCanonicalReleaseMetadata,
  nativeIconPaths,
  normalizeReleaseSocketUrl,
  readCanonicalReleaseMetadata,
  signingStatus,
} from '../scripts/releaseMetadata.mjs';

const repositoryRoot = path.resolve(process.cwd(), '../..');

describe('desktop release metadata', () => {
  it('derives the desktop release metadata from the canonical root version', () => {
    const metadata = readCanonicalReleaseMetadata(repositoryRoot);

    expect(metadata).toMatchObject({
      version: '3.0.0',
      productName: 'Own the Block',
      executableName: 'OwnTheBlock',
    });
    expect(nativeIconPaths(repositoryRoot)).toEqual(metadata.icons);
  });

  it('normalizes only absolute HTTP(S) release endpoints', () => {
    expect(normalizeReleaseSocketUrl('https://play.example.test/')).toBe(
      'https://play.example.test',
    );
    expect(() => normalizeReleaseSocketUrl('ws://play.example.test')).toThrow();
    expect(() => normalizeReleaseSocketUrl('')).toThrow();
  });

  it('requires an endpoint for release builds and marks unsigned validation explicitly', () => {
    expect(() => assertCanonicalReleaseMetadata({
      root: repositoryRoot,
      requireEndpoint: true,
      environment: {},
    })).toThrow('is required for a release build');
    expect(signingStatus({ platform: 'win32', mode: 'unsigned-validation', environment: {} })).toEqual({
      mode: 'unsigned-validation',
      signing: 'BLOCKED',
      notarization: 'NOT RUN',
    });
  });
});
