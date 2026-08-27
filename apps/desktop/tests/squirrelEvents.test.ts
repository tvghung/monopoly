import { describe, expect, it } from 'vitest';
import {
  getSquirrelLifecycleExitDelayMs,
  resolveSquirrelEvent,
  SQUIRREL_UPDATER_GRACE_MS,
  SQUIRREL_UPDATER_MAX_WAIT_MS,
} from '../src/squirrelEvents';

describe('Squirrel lifecycle events', () => {
  it('creates shortcuts during install and update hooks', () => {
    expect(resolveSquirrelEvent(['OwnTheBlock.exe', '--squirrel-install'], 'win32'))
      .toBe('create-shortcut');
    expect(resolveSquirrelEvent(['OwnTheBlock.exe', '--squirrel-updated'], 'win32'))
      .toBe('create-shortcut');
  });

  it('removes shortcuts during uninstall', () => {
    expect(resolveSquirrelEvent(['OwnTheBlock.exe', '--squirrel-uninstall'], 'win32'))
      .toBe('remove-shortcut');
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
});
