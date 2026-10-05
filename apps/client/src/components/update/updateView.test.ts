import { describe, expect, it } from 'vitest';
import type { AppUpdateState } from '../../runtime/types';
import {
  available, downloading, ready, requiredAvailable, updateState,
} from './updateTestFixtures';
import { lineKind, promptKind, type UpdateViewInput } from './updateView';

const base = { inSession: false, deferred: false, menuVisible: true } as const;
const input = (state: AppUpdateState | null, overrides: Partial<UpdateViewInput> = {}): UpdateViewInput => ({
  state, ...base, ...overrides,
});

const failedDownload = (overrides: Partial<AppUpdateState> = {}) => updateState({
  phase: 'error', update: available().update, error: { stage: 'download', code: 'OFFLINE' }, ...overrides,
});
const failedInstall = (overrides: Partial<AppUpdateState> = {}) => updateState({
  phase: 'error', update: available().update, error: { stage: 'install', code: 'INSTALL_FAILED' }, ...overrides,
});

describe('which update dialog the start screen opens', () => {
  it('offers an optional update, and stops once the player said "Để sau"', () => {
    expect(promptKind(input(available()))).toBe('offer');
    expect(promptKind(input(available(), { deferred: true }))).toBeNull();
  });

  it('shows a mandatory update whatever the player said, and offers nothing else until it is installed', () => {
    expect(promptKind(input(requiredAvailable()))).toBe('required');
    expect(promptKind(input(requiredAvailable(), { deferred: true }))).toBe('required');
    expect(promptKind(input(downloading(10, { update: requiredAvailable().update })))).toBe('required-downloading');
    expect(promptKind(input(failedDownload({ update: requiredAvailable().update })))).toBe('required');
    expect(promptKind(input(failedInstall({ update: requiredAvailable().update })))).toBe('required');
    expect(promptKind(input(ready({ update: requiredAvailable().update }), { deferred: true }))).toBe('ready');
  });

  it('keeps an optional download out of the way (the quiet line shows it) and asks once it is ready', () => {
    expect(promptKind(input(downloading(10)))).toBeNull();
    expect(promptKind(input(ready()))).toBe('ready');
    expect(promptKind(input(ready(), { deferred: true }))).toBeNull();
  });

  it('keeps an optional failed download or install to the quiet line', () => {
    expect(promptKind(input(failedDownload()))).toBeNull();
    expect(promptKind(input(failedInstall()))).toBeNull();
  });

  it('does not open a dialog over a form, in a lobby or a game, or for a state that has nothing to say', () => {
    expect(promptKind(input(available(), { menuVisible: false }))).toBeNull();
    expect(promptKind(input(requiredAvailable(), { menuVisible: false }))).toBeNull();
    expect(promptKind(input(ready(), { menuVisible: false }))).toBeNull();
    for (const state of [available(), requiredAvailable(), ready(), downloading(1)]) {
      expect(promptKind(input(state, { inSession: true }))).toBeNull();
    }
    for (const phase of ['unsupported', 'idle', 'checking', 'up-to-date'] as const) {
      expect(promptKind(input(updateState({ phase })))).toBeNull();
    }
    expect(promptKind(input(updateState({ phase: 'error', error: { stage: 'check', code: 'OFFLINE' } })))).toBeNull();
    expect(promptKind(input(null))).toBeNull();
  });

  it('keeps the install wait on screen even while a form is open, but never in a game', () => {
    const installing = updateState({ phase: 'installing', update: available().update });
    expect(promptKind(input(installing))).toBe('installing');
    expect(promptKind(input(installing, { menuVisible: false }))).toBe('installing');
    expect(promptKind(input(installing, { inSession: true }))).toBeNull();
  });

  it('leaves a ready update to the quiet line while a room of this machine is open, so "Đóng phòng" stays reachable', () => {
    expect(promptKind(input(ready({ installBlocked: 'HOST_OPEN' })))).toBeNull();
    expect(promptKind(input(ready({ installBlocked: 'HOST_OPEN', update: requiredAvailable().update })))).toBeNull();
  });
});

describe('which quiet line the start screen shows', () => {
  it('shows an optional download under way, and not a mandatory one (its dialog shows it)', () => {
    expect(lineKind(input(downloading(10)))).toBe('downloading');
    expect(lineKind(input(downloading(10), { deferred: true }))).toBe('downloading');
    expect(lineKind(input(downloading(10, { update: requiredAvailable().update })))).toBeNull();
  });

  it('shows a failed optional download or install until the player closes it', () => {
    expect(lineKind(input(failedDownload()))).toBe('failed');
    expect(lineKind(input(failedInstall()))).toBe('failed');
    expect(lineKind(input(failedDownload(), { deferred: true }))).toBeNull();
    expect(lineKind(input(failedDownload({ update: requiredAvailable().update })))).toBeNull();
  });

  it('says why a ready update waits when a room of this machine is open', () => {
    expect(lineKind(input(ready({ installBlocked: 'HOST_OPEN' })))).toBe('room-open');
    expect(lineKind(input(ready({ installBlocked: 'HOST_OPEN' }), { deferred: true }))).toBeNull();
    expect(lineKind(input(ready({ installBlocked: 'HOST_OPEN', update: requiredAvailable().update }), { deferred: true }))).toBe('room-open');
    expect(lineKind(input(ready()))).toBeNull();
  });

  it('shows nothing in a game, for a failed check, or without a state', () => {
    expect(lineKind(input(downloading(10), { inSession: true }))).toBeNull();
    expect(lineKind(input(failedDownload(), { inSession: true }))).toBeNull();
    expect(lineKind(input(updateState({ phase: 'error', error: { stage: 'check', code: 'OFFLINE' } })))).toBeNull();
    expect(lineKind(input(updateState({ phase: 'unsupported' })))).toBeNull();
    expect(lineKind(input(available()))).toBeNull();
    expect(lineKind(input(null))).toBeNull();
  });
});
