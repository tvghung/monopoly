import {
  existsSync, mkdtempSync, mkdirSync, rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  LOOPBACK_ACCEPTANCE_FLAG,
  LOOPBACK_ACCEPTANCE_PROFILE_PREFIX,
  loopbackAcceptanceEnvironment,
  parseLoopbackAcceptanceArguments,
  prepareLoopbackAcceptanceProfile,
  shouldEnableAutomaticUpdater,
} from '../src/localAcceptance';

const testRoot = mkdtempSync(path.join(os.tmpdir(), 'otb-f8-local-acceptance-'));

afterAll(() => {
  const temporaryRoot = path.resolve(os.tmpdir());
  const target = path.resolve(testRoot);
  if (!target.startsWith(`${temporaryRoot}${path.sep}otb-f8-local-acceptance-`)) {
    throw new Error('Refusing to remove a path outside the test-owned temporary directory.');
  }
  rmSync(target, { recursive: true, force: true });
});

describe('loopback acceptance startup gate', () => {
  it('leaves normal startup disabled when no opt-in arguments are present', () => {
    expect(parseLoopbackAcceptanceArguments(['OwnTheBlock.exe'])).toEqual({ enabled: false });
  });

  it('does not construct or start the automatic updater in local acceptance mode', () => {
    const parent = path.join(testRoot, 'updater-parent');
    mkdirSync(parent);
    const config = prepareLoopbackAcceptanceProfile(path.join(parent, 'profile'), path.join(testRoot, 'production-updater-data'));
    expect(shouldEnableAutomaticUpdater(config)).toBe(false);
    expect(shouldEnableAutomaticUpdater(undefined)).toBe(true);
  });

  it.each([
    ['missing profile path', [LOOPBACK_ACCEPTANCE_FLAG]],
    ['profile path without its mode flag', [`${LOOPBACK_ACCEPTANCE_PROFILE_PREFIX}C:\\temp\\profile`]],
    ['duplicate mode flags', [LOOPBACK_ACCEPTANCE_FLAG, LOOPBACK_ACCEPTANCE_FLAG,
      `${LOOPBACK_ACCEPTANCE_PROFILE_PREFIX}C:\\temp\\profile`]],
    ['relative profile path', [LOOPBACK_ACCEPTANCE_FLAG, `${LOOPBACK_ACCEPTANCE_PROFILE_PREFIX}relative`]],
    ['socket override', [LOOPBACK_ACCEPTANCE_FLAG, `${LOOPBACK_ACCEPTANCE_PROFILE_PREFIX}C:\\temp\\profile`,
      '--socket-url=https://outside.example']],
  ])('rejects %s without falling back to normal startup', (_name, argv) => {
    expect(() => parseLoopbackAcceptanceArguments(argv)).toThrow();
  });

  it('creates a fresh isolated profile and strips user credentials from the helper environment', () => {
    const parent = path.join(testRoot, 'fresh-parent');
    mkdirSync(parent);
    const profile = prepareLoopbackAcceptanceProfile(path.join(parent, 'profile-001'), path.join(testRoot, 'production-data'));
    expect(existsSync(profile.profile.userData)).toBe(true);
    expect(existsSync(profile.profile.sessionData)).toBe(true);
    expect(existsSync(profile.profile.logs)).toBe(true);
    expect(existsSync(profile.profile.temp)).toBe(true);
    expect(existsSync(profile.profile.appData)).toBe(true);
    expect(existsSync(profile.profile.localAppData)).toBe(true);
    expect(existsSync(profile.profile.userCache)).toBe(true);

    const environment = loopbackAcceptanceEnvironment({
      Path: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      OWN_THE_BLOCK_REGISTRY_URL: 'https://registry.example',
      OWN_THE_BLOCK_SOCKET_URL: 'https://service.example',
      GITHUB_TOKEN: 'secret-token',
      CLOUDFLARED_TUNNEL_TOKEN: 'tunnel-secret',
      AWS_SECRET_ACCESS_KEY: 'cloud-secret',
      NODE_OPTIONS: '--require outside.cjs',
    }, profile.profile);

    expect(environment).toMatchObject({
      Path: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      APPDATA: profile.profile.appData,
      LOCALAPPDATA: profile.profile.localAppData,
      USERPROFILE: profile.profile.home,
      HOME: profile.profile.home,
      TEMP: profile.profile.temp,
      TMP: profile.profile.temp,
      OTB_LOOPBACK_ACCEPTANCE_MODE: '1',
    });
    for (const secret of ['OWN_THE_BLOCK_REGISTRY_URL', 'OWN_THE_BLOCK_SOCKET_URL', 'GITHUB_TOKEN',
      'CLOUDFLARED_TUNNEL_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'NODE_OPTIONS']) {
      expect(environment[secret]).toBeUndefined();
    }
  });

  it('refuses profiles that overlap production user data or reuse an existing path', () => {
    const production = path.join(testRoot, 'production');
    mkdirSync(production);
    const inside = path.join(production, 'acceptance');
    expect(() => prepareLoopbackAcceptanceProfile(inside, production)).toThrow('separate');
    expect(existsSync(inside)).toBe(false);

    const outsideParent = path.join(testRoot, 'existing-parent');
    mkdirSync(outsideParent);
    const existing = path.join(outsideParent, 'profile');
    mkdirSync(existing);
    expect(() => prepareLoopbackAcceptanceProfile(existing, production)).toThrow('already exists');
  });
});
