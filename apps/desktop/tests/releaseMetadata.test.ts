import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCanonicalReleaseMetadata,
  nativeIconPaths,
  normalizeReleaseSocketUrl,
  readCanonicalReleaseMetadata,
  resolveReleaseTarget,
  resolveReleaseSocketUrl,
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

  it('allows LAN-only release builds while explicit endpoint validation stays strict', () => {
    const environment = { OWN_THE_BLOCK_RELEASE_BUILD: '1' };
    expect(resolveReleaseSocketUrl({ environment })).toBeUndefined();
    expect(assertCanonicalReleaseMetadata({
      root: repositoryRoot,
      environment,
    }).endpoint).toBeUndefined();
    expect(() => resolveReleaseSocketUrl({ environment, required: true }))
      .toThrow('is required for a release build');
    expect(assertCanonicalReleaseMetadata({
      root: repositoryRoot,
      environment: { OWN_THE_BLOCK_RELEASE_SOCKET_URL: 'https://play.example.test/' },
    }).endpoint).toBe('https://play.example.test');
  });

  it('marks unsigned validation explicitly', () => {
    expect(() => assertCanonicalReleaseMetadata({
      root: repositoryRoot,
      environment: {},
    })).not.toThrow();
    expect(signingStatus({ platform: 'win32', mode: 'unsigned-validation', environment: {} })).toEqual({
      mode: 'unsigned-validation',
      signing: 'BLOCKED',
      notarization: 'NOT RUN',
    });
  });

  it('requires release metadata to match the host platform and architecture', () => {
    expect(resolveReleaseTarget({
      environment: {
        OWN_THE_BLOCK_RELEASE_PLATFORM: 'darwin',
        OWN_THE_BLOCK_RELEASE_ARCH: 'arm64',
      },
      actualPlatform: 'darwin',
      actualArchitecture: 'arm64',
    })).toEqual({ platform: 'darwin', architecture: 'arm64' });
    expect(() => resolveReleaseTarget({
      environment: { OWN_THE_BLOCK_RELEASE_PLATFORM: 'win32' },
      actualPlatform: 'darwin',
      actualArchitecture: 'arm64',
    })).toThrow('does not match the current host platform');
    expect(() => resolveReleaseTarget({
      environment: { OWN_THE_BLOCK_RELEASE_ARCH: 'x64' },
      actualPlatform: 'darwin',
      actualArchitecture: 'arm64',
    })).toThrow('does not match the current host architecture');
  });
});
