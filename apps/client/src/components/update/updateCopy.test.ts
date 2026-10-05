import { describe, expect, it } from 'vitest';
import type { AppUpdateErrorCode } from '../../runtime/types';
import {
  applyLabel, downloadLabel, downloadPercent, failureMessage, offerBody, readyBody, settingsStatus, UPDATE_COPY,
} from './updateCopy';
import {
  available, downloading, ready, requiredAvailable, updateState,
} from './updateTestFixtures';

describe('update copy', () => {
  it('says what the owner wrote for an optional update', () => {
    expect(UPDATE_COPY.offerTitle).toBe('Có bản cập nhật mới');
    expect(offerBody(available())).toBe('Own the Block v1.2.0 đã sẵn sàng. Bạn đang sử dụng v1.1.1.');
    expect(UPDATE_COPY.update).toBe('Cập nhật');
    expect(UPDATE_COPY.later).toBe('Để sau');
  });

  it('says what the owner wrote for a mandatory update', () => {
    expect(UPDATE_COPY.requiredTitle).toBe('Cần cập nhật Own the Block');
    expect(UPDATE_COPY.requiredBody).toBe(
      'Phiên bản hiện tại của bạn không còn tương thích với phiên bản mới nhất. Vui lòng cập nhật để tiếp tục chơi.',
    );
  });

  it('shows the download as a sentence with a whole percentage, and as "…" while the size is unknown', () => {
    expect(downloadLabel(downloading(0))).toBe('Đang tải bản cập nhật — 0%');
    expect(downloadLabel(downloading(168_398_848 * 0.42))).toBe('Đang tải bản cập nhật — 42%');
    expect(downloadLabel(downloading(168_398_848))).toBe('Đang tải bản cập nhật — 100%');
    expect(downloadLabel(updateState({ phase: 'downloading', update: available().update }))).toBe('Đang tải bản cập nhật…');
    expect(downloadPercent(downloading(168_398_848 * 0.999))).toBe(99);
    expect(downloadPercent(updateState({ phase: 'downloading', progress: { receivedBytes: 5, totalBytes: 0 } }))).toBeNull();
    expect(downloadPercent(downloading(999_999_999_999))).toBe(100);
  });

  it('names the button that applies an update by what it does', () => {
    expect(applyLabel(ready())).toBe('Khởi động lại và cập nhật');
    expect(applyLabel(ready({ installMode: 'open-installer' }))).toBe('Mở bộ cài đặt');
    expect(applyLabel(ready({ installMode: 'open-installer', followUp: 'installer-opened' }))).toBe('Mở lại bộ cài đặt');
  });

  it('tells a ready update apart by how it is applied', () => {
    expect(readyBody(ready())).toContain('Game sẽ đóng và mở lại');
    expect(readyBody(ready({ installMode: 'open-installer' }))).toContain('thư mục Ứng dụng');
    expect(readyBody(ready({ installMode: 'open-installer', followUp: 'installer-opened' }))).toContain('Đã mở bộ cài đặt v1.2.0');
    expect(readyBody(ready({ followUp: 'restart-manually' }))).toContain('đóng game và mở lại');
  });

  it('adds that the game stays playable to every failure of an optional update, and only asks to retry a mandatory one', () => {
    const codes: AppUpdateErrorCode[] = [
      'OFFLINE', 'SERVER_ERROR', 'TIMEOUT', 'FEED_INVALID', 'INTEGRITY', 'DISK_SPACE', 'DISK_WRITE',
      'INSTALL_FAILED', 'INSTALL_START_FAILED', 'UNKNOWN',
    ];
    for (const stage of ['check', 'download', 'install'] as const) {
      for (const code of codes) {
        const state = updateState({ phase: 'error', update: available().update, error: { stage, code } });
        expect(failureMessage(state, true), `${stage}/${code}`).toMatch(/Bạn vẫn có thể tiếp tục chơi\.$/u);
        expect(failureMessage(state, false), `${stage}/${code}`).not.toMatch(/tiếp tục chơi/u);
        expect(failureMessage(state, true), `${stage}/${code}`).not.toMatch(/[A-Z_]{4,}|https?:|\.exe|0x/u);
      }
    }
    expect(failureMessage(updateState(), true)).toBe('');
  });

  it('says a failed check as the owner wrote it', () => {
    const failed = updateState({ phase: 'error', error: { stage: 'check', code: 'OFFLINE' } });
    expect(failureMessage(failed, true)).toBe('Không thể kiểm tra bản cập nhật lúc này. Bạn vẫn có thể tiếp tục chơi.');
    expect(settingsStatus(failed, false)).toBe('Không thể kiểm tra bản cập nhật lúc này. Bạn vẫn có thể tiếp tục chơi.');
  });

  it('gives a specific line for a corrupted download, a full disk and an installer that cannot open', () => {
    const line = (stage: 'download' | 'install', code: AppUpdateErrorCode) => failureMessage(
      updateState({ phase: 'error', update: available().update, error: { stage, code } }), true,
    );
    expect(line('download', 'INTEGRITY')).toContain('bị lỗi');
    expect(line('download', 'DISK_SPACE')).toContain('chỗ trống');
    expect(line('install', 'INSTALL_START_FAILED')).toContain('Không mở được bộ cài đặt');
    expect(line('download', 'OFFLINE')).toContain('kết nối Internet');
  });

  it('writes the settings status for every phase', () => {
    expect(settingsStatus(updateState({ phase: 'idle' }), false)).toBe('');
    expect(settingsStatus(updateState({ phase: 'checking' }), false)).toBe('Đang kiểm tra bản cập nhật…');
    expect(settingsStatus(updateState({ phase: 'up-to-date' }), false)).toBe('Bạn đang sử dụng phiên bản mới nhất.');
    expect(settingsStatus(available(), false)).toBe('Có phiên bản 1.2.0.');
    expect(settingsStatus(requiredAvailable(), false)).toBe('Có phiên bản 1.2.0. Cần cập nhật để tiếp tục chơi.');
    expect(settingsStatus(downloading(168_398_848 / 2), false)).toBe('Đang tải bản cập nhật — 50%');
    expect(settingsStatus(ready(), false)).toBe('Bản cập nhật v1.2.0 đã sẵn sàng.');
    expect(settingsStatus(updateState({ phase: 'installing', update: available().update }), false)).toBe('Đang cài đặt bản cập nhật…');
  });

  it('says why a ready update waits: a game is on, or a room is open', () => {
    expect(settingsStatus(ready(), true)).toBe('Bản cập nhật đã sẵn sàng. Bạn có thể cập nhật sau khi kết thúc ván chơi.');
    expect(settingsStatus(ready({ installBlocked: 'HOST_OPEN' }), false)).toBe(UPDATE_COPY.readyBlockedByRoom);
    expect(UPDATE_COPY.readyAfterGame).toBe('Bản cập nhật đã sẵn sàng. Bạn có thể cập nhật sau khi kết thúc ván chơi.');
  });

  it('uses plain Vietnamese: no technical words in any fixed line', () => {
    for (const value of Object.values(UPDATE_COPY)) {
      expect(value).not.toMatch(/\b(sha|checksum|manifest|http|url|squirrel|nupkg|installer|setup\.exe|api|ipc|token)\b/iu);
    }
  });
});
