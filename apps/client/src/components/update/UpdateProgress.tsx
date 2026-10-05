import type { AppUpdateState } from '../../runtime/types';
import { downloadLabel, downloadPercent, UPDATE_COPY } from './updateCopy';

/**
 * The download progress: one sentence ("Đang tải bản cập nhật — 42%") and a bar. The bar is a real progressbar for a screen
 * reader; while the size is not known it has no value, so it is never a made-up percentage.
 */
export default function UpdateProgress({ state }: { state: AppUpdateState }) {
  const percent = downloadPercent(state);
  return (
    <div className="update-progress">
      <p className="update-progress__label" role="status">{downloadLabel(state)}</p>
      <div
        className="update-progress__bar"
        role="progressbar"
        aria-label={UPDATE_COPY.progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        data-indeterminate={percent === null ? 'true' : undefined}
      >
        <span className="update-progress__fill" style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
    </div>
  );
}
