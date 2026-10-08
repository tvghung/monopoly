import { describe, expect, it } from 'vitest';
import { localizeAckError } from '../game/ui/formatters';
import { en, vi } from './catalog';

// The server keeps every room, session and offer in process RAM. Nothing a player reads may describe
// a database, durable storage or a restart that brings a match back.
const OBSOLETE_STORAGE_WORDING = new RegExp([
  'postgres', 'database', 'durable', 'persistent storage', 'cơ sở dữ liệu', 'máy chủ dữ liệu', 'lưu trữ bền',
  'saved room data', 'room data is saved', 'restored when the host', 'dữ liệu các phòng đã lưu', 'giữ lại để khôi phục',
].join('|'), 'iu');

describe('localized runtime error text', () => {
  it('has no database or durable-storage wording in any shipped string', () => {
    for (const [language, catalog] of [['vi', vi], ['en', en]] as const) {
      const offenders = Object.entries(catalog)
        .filter(([, text]) => OBSOLETE_STORAGE_WORDING.test(text))
        .map(([key]) => `${language}:${key}`);
      expect(offenders).toEqual([]);
    }
  });

  it('describes a legacy storage outage code as an unavailable game service', () => {
    const legacy = { code: 'DATABASE_UNAVAILABLE', message: 'Durable storage is temporarily unavailable.' } as const;
    expect(localizeAckError(legacy, 'vi')).toBe('Dịch vụ trò chơi tạm thời không khả dụng. Vui lòng thử lại.');
    expect(localizeAckError(legacy, 'en')).toBe('The game service is temporarily unavailable. Try again.');
    // The server's own text is never shown: only the localized string for the code is.
    expect(localizeAckError(legacy, 'en')).not.toMatch(/storage/iu);
  });

  it('tells a Host that quitting ends the match for good and that it cannot be restored', () => {
    expect(vi['app.closeHostMessage']).toMatch(/vĩnh viễn/u);
    expect(vi['app.closeHostMessage']).toMatch(/không thể khôi phục/u);
    expect(en['app.closeHostMessage']).toMatch(/for good/u);
    expect(en['app.closeHostMessage']).toMatch(/cannot be restored/u);
  });

  it('no longer ships the startup data-recovery failures of the retired database host', () => {
    for (const catalog of [vi, en]) {
      const keys = Object.keys(catalog);
      expect(keys).not.toContain('launcher.hostDataFailed');
      expect(keys).not.toContain('launcher.hostMigrationFailed');
    }
  });

  it('keeps the vi and en ACK error strings in step', () => {
    const ackKeys = (catalog: Record<string, string>): string[] => Object.keys(catalog).filter(key => key.startsWith('ack.')).sort();
    expect(ackKeys(en)).toEqual(ackKeys(vi));
  });
});

describe('singular house labels (mobile overhaul)', () => {
  it('never says "1 houses" in English', () => {
    expect(en['development.buildOne']).toBe('Build 1 house ({amount})');
    expect(en['development.buildShortOne']).toBe('Build 1 house');
    expect(en['property.houseTierOne']).toBe('With 1 house');
    const offenders = Object.entries(en).filter(([, text]) => /\b1 houses\b/u.test(text)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });
});
