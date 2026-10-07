import type { AppUpdateErrorCode, AppUpdateState } from '../../runtime/types';
import { translate, type Language } from '../../i18n/I18n';

const COPY_KEYS = {
  offerTitle: 'update.offerTitle',
  requiredTitle: 'update.requiredTitle',
  requiredBody: 'update.requiredBody',
  readyTitle: 'update.readyTitle',
  installingTitle: 'update.installingTitle',
  installingBody: 'update.installingBody',
  update: 'update.update',
  later: 'update.later',
  retry: 'update.retry',
  cancel: 'update.cancel',
  dismiss: 'update.dismiss',
  quit: 'update.quit',
  check: 'update.check',
  checking: 'update.checking',
  restart: 'update.restart',
  openInstaller: 'update.openInstaller',
  reopenInstaller: 'update.reopenInstaller',
  progressLabel: 'update.progressLabel',
  requiredBlockedByRoom: 'update.requiredBlockedByRoom',
  readyBlockedByRoom: 'update.readyBlockedByRoom',
  readyAfterGame: 'update.readyAfterGame',
  requiredAfterGame: 'update.requiredAfterGame',
  upToDate: 'update.upToDate',
  unsupportedHint: 'update.unsupportedHint',
  checkFailed: 'update.checkFailed',
} as const;

export type UpdateCopy = { [K in keyof typeof COPY_KEYS]: string };

const UPDATE_COPY_VI = Object.fromEntries(Object.entries(COPY_KEYS).map(([key, messageKey]) => [key, translate(messageKey, 'vi')])) as UpdateCopy;
const UPDATE_COPY_EN = Object.fromEntries(Object.entries(COPY_KEYS).map(([key, messageKey]) => [key, translate(messageKey, 'en')])) as UpdateCopy;

export function getUpdateCopy(language: Language): UpdateCopy {
  return language === 'en' ? UPDATE_COPY_EN : UPDATE_COPY_VI;
}

/** Vietnamese remains the default for non-React consumers and existing copy assertions. */
export const UPDATE_COPY = UPDATE_COPY_VI;

export function versionLabel(version: string): string {
  return `v${version}`;
}

export function offerBody(state: AppUpdateState, language: Language = 'vi'): string {
  const next = state.update ? versionLabel(state.update.version) : translate('update.optionalVersion', language);
  return translate('update.optionalReady', language, {
    next,
    current: versionLabel(state.currentVersion),
  });
}

export function readyBody(state: AppUpdateState, language: Language = 'vi'): string {
  const next = state.update ? versionLabel(state.update.version) : translate('update.optionalVersion', language);
  if (state.installMode === 'open-installer') {
    if (state.followUp === 'installer-opened') {
      return translate('update.installerOpened', language, { next });
    }
    return translate('update.installerReady', language, {
      next,
      openInstaller: translate('update.openInstaller', language),
    });
  }
  if (state.followUp === 'restart-manually') {
    return translate('update.restartManually', language, { next });
  }
  return translate('update.restartReady', language, { next });
}

/** The label of the button that applies a downloaded update. */
export function applyLabel(state: AppUpdateState, language: Language = 'vi'): string {
  if (state.installMode === 'restart') return translate('update.restart', language);
  return state.followUp === 'installer-opened'
    ? translate('update.reopenInstaller', language)
    : translate('update.openInstaller', language);
}

/** Whole percent, or null while the size is not known. */
export function downloadPercent(state: AppUpdateState): number | null {
  const progress = state.progress;
  if (!progress || progress.totalBytes <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor((progress.receivedBytes / progress.totalBytes) * 100)));
}

export function downloadLabel(state: AppUpdateState, language: Language = 'vi'): string {
  const percent = downloadPercent(state);
  return percent === null
    ? translate('update.downloading', language)
    : translate('update.downloadingPercent', language, { percent });
}

const DOWNLOAD_FAILURE: Partial<Record<AppUpdateErrorCode, Parameters<typeof translate>[0]>> = {
  INTEGRITY: 'update.failureIntegrity',
  DISK_SPACE: 'update.failureDiskSpace',
  DISK_WRITE: 'update.failureDiskWrite',
};

const INSTALL_FAILURE: Partial<Record<AppUpdateErrorCode, Parameters<typeof translate>[0]>> = {
  INSTALL_START_FAILED: 'update.failureInstallStart',
};

/** The line for a failed step. Optional updates also explain that the game remains playable. */
export function failureMessage(state: AppUpdateState, playable: boolean, language: Language = 'vi'): string {
  const failure = state.error;
  if (!failure) return '';
  const tail = playable ? translate('update.playableTail', language) : '';
  if (failure.stage === 'check') {
    return playable
      ? translate('update.checkFailed', language)
      : translate('update.failureCheckRetry', language);
  }
  if (failure.stage === 'install') {
    return `${translate(INSTALL_FAILURE[failure.code] ?? 'update.failureInstall', language)}${tail}`;
  }
  return `${translate(DOWNLOAD_FAILURE[failure.code] ?? 'update.failureDownload', language)}${tail}`;
}

/** The status line of the settings dialog: one sentence for the phase the updater is in. */
export function settingsStatus(state: AppUpdateState, inSession: boolean, language: Language = 'vi'): string {
  const next = state.update ? versionLabel(state.update.version) : '';
  switch (state.phase) {
    case 'checking':
      return translate('update.checkingStatus', language);
    case 'up-to-date':
      return translate('update.upToDate', language);
    case 'available':
      return state.update?.mandatory
        ? translate('update.requiredVersion', language, { version: state.update.version })
        : translate('update.optionalVersion', language, { version: state.update?.version ?? '' });
    case 'downloading':
      return downloadLabel(state, language);
    case 'ready':
      if (state.installBlocked) return translate('update.readyBlockedByRoom', language);
      if (inSession) return translate('update.readyAfterGame', language);
      return state.installMode === 'open-installer' && state.followUp === 'installer-opened'
        ? readyBody(state, language)
        : translate('update.readyVersion', language, { version: next });
    case 'installing':
      return translate('update.installingStatus', language);
    case 'error':
      return failureMessage(state, state.update?.mandatory !== true, language);
    default:
      return '';
  }
}
