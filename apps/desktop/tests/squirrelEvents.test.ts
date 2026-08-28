import { describe, expect, it } from 'vitest';
import {
  getSquirrelLifecycleExitDelayMs,
  resolveSquirrelEvent,
  routeSquirrelStartup,
  runSquirrelLifecycle,
  SQUIRREL_UPDATER_GRACE_MS,
  SQUIRREL_UPDATER_MAX_WAIT_MS,
} from '../src/squirrelEvents';

describe('Squirrel lifecycle events', () => {
  it.each(['--squirrel-install', '--squirrel-updated'])(
    'runs exactly one createShortcut updater for %s',
    event => {
      const updaterCalls: string[][] = [];
      const scheduled: Array<{ callback: () => void; delayMs: number }> = [];

      expect(runSquirrelLifecycle({
        argv: ['OwnTheBlock.exe', event],
        platform: 'win32',
        executableName: 'OwnTheBlock.exe',
        runUpdater: args => updaterCalls.push(args),
        quit: () => undefined,
        scheduleQuit: (callback, delayMs) => scheduled.push({ callback, delayMs }),
      })).toBe(true);

      expect(updaterCalls).toEqual([['--createShortcut', 'OwnTheBlock.exe']]);
      expect(updaterCalls).toHaveLength(1);
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0].delayMs).toBe(SQUIRREL_UPDATER_GRACE_MS);
    },
  );

  it('runs exactly one removeShortcut updater on uninstall without root cleanup', () => {
    const updaterCalls: string[][] = [];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];

    expect(runSquirrelLifecycle({
      argv: ['OwnTheBlock.exe', '--squirrel-uninstall'],
      platform: 'win32',
      executableName: 'OwnTheBlock.exe',
      runUpdater: args => updaterCalls.push(args),
      quit: () => undefined,
      scheduleQuit: (callback, delayMs) => scheduled.push({ callback, delayMs }),
    })).toBe(true);

    expect(updaterCalls).toEqual([['--removeShortcut', 'OwnTheBlock.exe']]);
    expect(updaterCalls).toHaveLength(1);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delayMs).toBe(SQUIRREL_UPDATER_GRACE_MS);
  });

  it('completes through the supplied quit path after bounded waiting', () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    let quitCalls = 0;

    runSquirrelLifecycle({
      argv: ['OwnTheBlock.exe', '--squirrel-uninstall'],
      platform: 'win32',
      executableName: 'OwnTheBlock.exe',
      runUpdater: () => undefined,
      quit: () => { quitCalls += 1; },
      scheduleQuit: (callback, delayMs) => scheduled.push({ callback, delayMs }),
    });

    expect(quitCalls).toBe(0);
    expect(scheduled[0].delayMs).toBeLessThanOrEqual(SQUIRREL_UPDATER_MAX_WAIT_MS);
    scheduled[0].callback();
    expect(quitCalls).toBe(1);
  });

  it('quits for obsolete or unknown Windows lifecycle events', () => {
    expect(resolveSquirrelEvent(['OwnTheBlock.exe', '--squirrel-obsolete'], 'win32'))
      .toBe('quit');
    expect(resolveSquirrelEvent(['OwnTheBlock.exe', '--squirrel-future'], 'win32'))
      .toBe('quit');
  });

  it('does not intercept development or non-Windows launches', () => {
    expect(resolveSquirrelEvent(['OwnTheBlock.exe'], 'win32')).toBeUndefined();
    expect(resolveSquirrelEvent(['OwnTheBlock.exe', '--squirrel-install'], 'darwin'))
      .toBeUndefined();
  });

  it('keeps the lifecycle process alive briefly for updater work', () => {
    expect(getSquirrelLifecycleExitDelayMs('create-shortcut'))
      .toBe(SQUIRREL_UPDATER_GRACE_MS);
    expect(getSquirrelLifecycleExitDelayMs('remove-shortcut'))
      .toBe(SQUIRREL_UPDATER_GRACE_MS);
    expect(getSquirrelLifecycleExitDelayMs('quit')).toBe(0);
    expect(SQUIRREL_UPDATER_MAX_WAIT_MS).toBeGreaterThan(SQUIRREL_UPDATER_GRACE_MS);
  });

  it('skips normal desktop startup for Squirrel events', () => {
    let normalStartupCalls = 0;
    expect(routeSquirrelStartup(
      () => true,
      () => { normalStartupCalls += 1; },
    )).toBe('squirrel');
    expect(normalStartupCalls).toBe(0);
  });

  it('starts normal desktop startup for non-Squirrel launches', () => {
    let normalStartupCalls = 0;
    expect(routeSquirrelStartup(
      () => false,
      () => { normalStartupCalls += 1; },
    )).toBe('normal');
    expect(normalStartupCalls).toBe(1);
  });

  it('quits safely for obsolete or unknown lifecycle events', () => {
    const updaterCalls: string[][] = [];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    let quitCalls = 0;

    expect(runSquirrelLifecycle({
      argv: ['OwnTheBlock.exe', '--squirrel-obsolete'],
      platform: 'win32',
      executableName: 'OwnTheBlock.exe',
      runUpdater: args => updaterCalls.push(args),
      quit: () => { quitCalls += 1; },
      scheduleQuit: (callback, delayMs) => scheduled.push({ callback, delayMs }),
    })).toBe(true);

    expect(updaterCalls).toEqual([]);
    expect(scheduled[0].delayMs).toBe(0);
    scheduled[0].callback();
    expect(quitCalls).toBe(1);
  });
});
