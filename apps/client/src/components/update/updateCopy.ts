import type { AppUpdateErrorCode, AppUpdateState } from '../../runtime/types';

/**
 * Everything the update screens say, in plain Vietnamese: no address, file name, checksum or error code. Every failure
 * line says what the player can do next, and for an update that is not mandatory it says the game stays playable.
 */
export const UPDATE_COPY = {
  offerTitle: 'Có bản cập nhật mới',
  requiredTitle: 'Cần cập nhật Own the Block',
  requiredBody: 'Phiên bản hiện tại của bạn không còn tương thích với phiên bản mới nhất. Vui lòng cập nhật để tiếp tục chơi.',
  readyTitle: 'Bản cập nhật đã sẵn sàng',
  installingTitle: 'Đang cài đặt bản cập nhật',
  installingBody: 'Game sẽ tự mở lại khi cài xong. Vui lòng chưa tắt máy.',
  update: 'Cập nhật',
  later: 'Để sau',
  retry: 'Thử lại',
  cancel: 'Hủy',
  dismiss: 'Đóng',
  quit: 'Thoát game',
  check: 'Kiểm tra cập nhật',
  checking: 'Đang kiểm tra…',
  restart: 'Khởi động lại và cập nhật',
  openInstaller: 'Mở bộ cài đặt',
  reopenInstaller: 'Mở lại bộ cài đặt',
  progressLabel: 'Tiến trình tải bản cập nhật',
  requiredBlockedByRoom: 'Cần cập nhật Own the Block. Hãy đóng phòng đang mở trên máy này rồi cập nhật.',
  readyBlockedByRoom: 'Bản cập nhật đã sẵn sàng. Hãy đóng phòng đang mở trên máy này rồi cập nhật.',
  readyAfterGame: 'Bản cập nhật đã sẵn sàng. Bạn có thể cập nhật sau khi kết thúc ván chơi.',
  requiredAfterGame: 'Cần cập nhật Own the Block. Bạn có thể cập nhật sau khi rời phòng.',
  upToDate: 'Bạn đang sử dụng phiên bản mới nhất.',
  unsupportedHint: 'Cập nhật tự động không có trong bản này.',
  checkFailed: 'Không thể kiểm tra bản cập nhật lúc này. Bạn vẫn có thể tiếp tục chơi.',
} as const;

export function versionLabel(version: string): string {
  return `v${version}`;
}

export function offerBody(state: AppUpdateState): string {
  const next = state.update ? versionLabel(state.update.version) : 'Bản mới';
  return `Own the Block ${next} đã sẵn sàng. Bạn đang sử dụng ${versionLabel(state.currentVersion)}.`;
}

export function readyBody(state: AppUpdateState): string {
  const next = state.update ? versionLabel(state.update.version) : 'Bản mới';
  if (state.installMode === 'open-installer') {
    if (state.followUp === 'installer-opened') {
      return `Đã mở bộ cài đặt ${next}. Kéo Own the Block vào thư mục Ứng dụng (Applications) hoặc làm theo bộ cài đặt, rồi mở lại game.`;
    }
    return `Own the Block ${next} đã được tải xong. Bấm "${UPDATE_COPY.openInstaller}", rồi kéo Own the Block vào thư mục Ứng dụng (Applications) hoặc làm theo bộ cài đặt.`;
  }
  if (state.followUp === 'restart-manually') {
    return `Đã cài đặt ${next}. Hãy đóng game và mở lại để dùng phiên bản mới.`;
  }
  return `Own the Block ${next} đã được tải xong. Game sẽ đóng và mở lại để hoàn tất cập nhật.`;
}

/** The label of the button that applies a downloaded update. */
export function applyLabel(state: AppUpdateState): string {
  if (state.installMode === 'restart') return UPDATE_COPY.restart;
  return state.followUp === 'installer-opened' ? UPDATE_COPY.reopenInstaller : UPDATE_COPY.openInstaller;
}

/** Whole percent, or null while the size is not known. */
export function downloadPercent(state: AppUpdateState): number | null {
  const progress = state.progress;
  if (!progress || progress.totalBytes <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor((progress.receivedBytes / progress.totalBytes) * 100)));
}

export function downloadLabel(state: AppUpdateState): string {
  const percent = downloadPercent(state);
  return percent === null ? 'Đang tải bản cập nhật…' : `Đang tải bản cập nhật — ${percent}%`;
}

const DOWNLOAD_FAILURE: Partial<Record<AppUpdateErrorCode, string>> = {
  INTEGRITY: 'Bản cập nhật tải về bị lỗi. Hãy thử tải lại.',
  DISK_SPACE: 'Máy không còn đủ chỗ trống để tải bản cập nhật. Hãy giải phóng ổ đĩa rồi thử lại.',
  DISK_WRITE: 'Không lưu được bản cập nhật vào máy. Hãy thử lại.',
};

const INSTALL_FAILURE: Partial<Record<AppUpdateErrorCode, string>> = {
  INSTALL_START_FAILED: 'Không mở được bộ cài đặt. Hãy thử lại.',
};

/**
 * The line for a failed step. `playable` is true for an update that is not mandatory: those lines add that the game still
 * works; a mandatory update only says to try again.
 */
export function failureMessage(state: AppUpdateState, playable: boolean): string {
  const failure = state.error;
  if (!failure) return '';
  const tail = playable ? ' Bạn vẫn có thể tiếp tục chơi.' : '';
  if (failure.stage === 'check') return playable ? UPDATE_COPY.checkFailed : 'Không thể kiểm tra bản cập nhật lúc này. Hãy thử lại sau.';
  if (failure.stage === 'install') {
    return `${INSTALL_FAILURE[failure.code] ?? 'Không cài đặt được bản cập nhật. Hãy thử lại.'}${tail}`;
  }
  const specific = DOWNLOAD_FAILURE[failure.code];
  return `${specific ?? 'Không thể tải bản cập nhật. Hãy kiểm tra kết nối Internet rồi thử lại.'}${tail}`;
}

/** The status line of the settings dialog: one sentence for the phase the updater is in. */
export function settingsStatus(state: AppUpdateState, inSession: boolean): string {
  const next = state.update ? versionLabel(state.update.version) : '';
  switch (state.phase) {
    case 'checking':
      return 'Đang kiểm tra bản cập nhật…';
    case 'up-to-date':
      return UPDATE_COPY.upToDate;
    case 'available':
      return state.update?.mandatory
        ? `Có phiên bản ${state.update.version}. Cần cập nhật để tiếp tục chơi.`
        : `Có phiên bản ${state.update?.version ?? ''}.`;
    case 'downloading':
      return downloadLabel(state);
    case 'ready':
      if (state.installBlocked) return UPDATE_COPY.readyBlockedByRoom;
      if (inSession) return UPDATE_COPY.readyAfterGame;
      return state.installMode === 'open-installer' && state.followUp === 'installer-opened'
        ? readyBody(state)
        : `Bản cập nhật ${next} đã sẵn sàng.`;
    case 'installing':
      return 'Đang cài đặt bản cập nhật…';
    case 'error':
      return failureMessage(state, state.update?.mandatory !== true);
    default:
      return '';
  }
}
