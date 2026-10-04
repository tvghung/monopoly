import { describe, expect, it } from 'vitest';
import { compareVersions, isValidVersion, parseVersion } from '../src/update/version';

describe('update version precedence', () => {
  it('orders releases by major, minor and patch as numbers, not as text', () => {
    expect(compareVersions('1.1.1', '1.2.0')).toBeLessThan(0);
    expect(compareVersions('1.2.0', '1.1.1')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('puts a pre-release before its release and follows the semver.org precedence chain', () => {
    const ascending = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
    ];
    for (let index = 1; index < ascending.length; index += 1) {
      expect(compareVersions(ascending[index - 1], ascending[index])).toBeLessThan(0);
      expect(compareVersions(ascending[index], ascending[index - 1])).toBeGreaterThan(0);
    }
  });

  it('ignores build metadata', () => {
    expect(compareVersions('1.0.0+build.5', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0+a', '1.0.0+b')).toBe(0);
  });

  it.each(['', '1', '1.2', 'v1.2.3', '01.2.3', '1.02.3', '1.2.3-', '1.2.3.4', '1.2.3-01', ' 1.2.3', '1.2.3 ', 'latest'])(
    'refuses %j as a version',
    value => {
      expect(parseVersion(value)).toBeUndefined();
      expect(isValidVersion(value)).toBe(false);
    },
  );

  it('refuses a number that is not a safe integer', () => {
    expect(parseVersion('99999999999999999999.0.0')).toBeUndefined();
  });

  it('refuses to compare something that is not a version', () => {
    expect(() => compareVersions('1.2.3', 'latest')).toThrow(RangeError);
    expect(() => compareVersions('nope', '1.2.3')).toThrow(RangeError);
  });

  it('accepts only strings as versions', () => {
    expect(isValidVersion(undefined)).toBe(false);
    expect(isValidVersion(1.1)).toBe(false);
    expect(isValidVersion('1.1.1')).toBe(true);
  });
});
