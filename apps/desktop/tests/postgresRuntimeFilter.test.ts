import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertExcludesKeepRequiredBinaries,
  excludePatternToRegExp,
  REQUIRED_POSTGRES_BINARIES,
  shouldShipPostgresFile,
} from '../scripts/postgresRuntimeFilter.mjs';

interface PostgresTarget {
  runtimeExclude?: string[];
}

const resources = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'postgres-resources.json'), 'utf8'),
) as { targets: Record<string, PostgresTarget> };
const windowsExclude = resources.targets['win32-x64']?.runtimeExclude ?? [];

// The DLLs that the six runtime binaries and every lib/*.dll import, transitively (PE import tables of the
// EDB 17.11 Windows archive). Dropping any of them breaks initdb or the server on a player's machine.
const WINDOWS_IMPORT_CLOSURE = [
  'icudt67.dll', 'icuin67.dll', 'icuuc67.dll', 'libcrypto-3-x64.dll', 'libiconv-2.dll', 'libintl-9.dll',
  'liblz4.dll', 'libpq.dll', 'libssl-3-x64.dll', 'libwinpthread-1.dll', 'libxml2.dll', 'libxslt.dll',
  'libzstd.dll', 'zlib1.dll',
];

describe('PostgreSQL runtime filter', () => {
  it('keeps the six runtime binaries and their whole DLL import closure on Windows', () => {
    for (const binary of REQUIRED_POSTGRES_BINARIES) {
      expect(shouldShipPostgresFile(`bin/${binary}.exe`, windowsExclude), binary).toBe(true);
    }
    for (const dll of WINDOWS_IMPORT_CLOSURE) {
      expect(shouldShipPostgresFile(`bin/${dll}`, windowsExclude), dll).toBe(true);
    }
  });

  it('keeps the server modules, share data and license that the runtime loads', () => {
    for (const file of [
      'lib/plpgsql.dll',
      'lib/dict_snowball.dll',
      'lib/utf8_and_gb18030.dll',
      'share/postgres.bki',
      'share/extension/plpgsql.control',
      'share/timezone/Asia/Ho_Chi_Minh',
      'share/locale/vi/LC_MESSAGES/postgres-17.mo',
      'bin/pg_dump.exe',
    ]) {
      expect(shouldShipPostgresFile(file, windowsExclude), file).toBe(true);
    }
  });

  it('drops link-time libraries, the build kit and the StackBuilder GUI on Windows', () => {
    for (const file of [
      'lib/libpq.lib',
      'lib/libpgcommon.a',
      'lib/wxmsw32u_core.lib',
      'lib/pgxs',
      'lib/pgxs/src/makefiles/pgxs.mk',
      'lib/pgxs/src/test/perl/PostgreSQL/Test/Cluster.pm',
      'lib/pkgconfig/libpq.pc',
      'bin/wxmsw3211u_core_vc_x64_custom.dll',
      'bin/wxbase3211u_vc_x64_custom.dll',
      'bin/stackbuilder.exe',
      'bin/libcurl.dll',
      'bin/libecpg.dll',
      'bin/libecpg_compat.dll',
      'bin/libpgtypes.dll',
      'bin/testplug.dll',
      'bin/icutu67.dll',
      'bin/icuio67.dll',
    ]) {
      expect(shouldShipPostgresFile(file, windowsExclude), file).toBe(false);
    }
  });

  it('accepts Windows separators and ignores case', () => {
    expect(shouldShipPostgresFile('lib\\pgxs\\config\\install-sh', windowsExclude)).toBe(false);
    expect(shouldShipPostgresFile('BIN\\StackBuilder.EXE', windowsExclude)).toBe(false);
    expect(shouldShipPostgresFile('bin\\postgres.exe', windowsExclude)).toBe(true);
  });

  it('only drops link-time files on macOS, whose layout is not measured yet', () => {
    for (const key of ['darwin-x64', 'darwin-arm64']) {
      const exclude = resources.targets[key]?.runtimeExclude ?? [];
      expect(exclude).toEqual(['lib/**/*.a', 'lib/pgxs/**', 'lib/pkgconfig/**']);
      expect(shouldShipPostgresFile('lib/libpq.5.dylib', exclude)).toBe(true);
      expect(shouldShipPostgresFile('lib/libpgcommon.a', exclude)).toBe(false);
      assertExcludesKeepRequiredBinaries(exclude, '');
    }
  });

  it('rejects patterns that would drop a required binary or leave the archive root', () => {
    expect(() => assertExcludesKeepRequiredBinaries(['bin/*.exe'], '.exe')).toThrow(/initdb/u);
    expect(() => assertExcludesKeepRequiredBinaries(windowsExclude, '.exe')).not.toThrow();
    expect(() => excludePatternToRegExp('../outside')).toThrow();
    expect(() => excludePatternToRegExp('')).toThrow();
  });
});
