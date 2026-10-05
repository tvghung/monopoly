import type { AppUpdateState } from '../../runtime/types';

/**
 * Which update surface the start screen shows for a state: a dialog for a decision, or one quiet line for what is going on.
 * Pure on purpose, so every combination of phase, mandatory update, "Để sau", a room that is open and a player who is in a
 * game is listed in one place and tested without rendering. Nothing here is shown in a lobby or a game (`inSession`): an
 * update may download there, but nothing interrupts the play (a toast says it is ready, see `UpdateSessionNotice`).
 */
export interface UpdateViewInput {
  state: AppUpdateState | null;
  inSession: boolean;
  /** "Để sau" was pressed for this version (never true for a mandatory update). */
  deferred: boolean;
  /** The start screen shows its menu, not a form: a dialog never opens over a form the player is typing in. */
  menuVisible: boolean;
}

export type UpdatePromptKind =
  /** An optional update was found. */
  | 'offer'
  /** A mandatory update: nothing else can be done until it is installed. Also the screen of its failed download or install. */
  | 'required'
  | 'required-downloading'
  | 'ready'
  | 'installing';

export type UpdateLineKind = 'downloading' | 'failed' | 'room-open';

function fixable(state: AppUpdateState): boolean {
  return state.phase === 'error' && (state.error?.stage === 'download' || state.error?.stage === 'install');
}

export function promptKind({ state, inSession, deferred, menuVisible }: UpdateViewInput): UpdatePromptKind | null {
  if (!state || inSession || state.phase === 'unsupported') return null;
  const mandatory = state.update?.mandatory === true;
  if (state.phase === 'installing') return 'installing';
  if (!menuVisible) return null;

  switch (state.phase) {
    case 'available':
      if (mandatory) return 'required';
      return deferred ? null : 'offer';
    case 'downloading':
      return mandatory ? 'required-downloading' : null;
    case 'ready':
      // A room of this machine is open: a dialog over the menu would hide "Đóng phòng", the way out. The line speaks instead.
      if (state.installBlocked) return null;
      return mandatory || !deferred ? 'ready' : null;
    case 'error':
      return fixable(state) && mandatory ? 'required' : null;
    default:
      return null;
  }
}

export function lineKind({ state, inSession, deferred }: UpdateViewInput): UpdateLineKind | null {
  if (!state || inSession || state.phase === 'unsupported') return null;
  const mandatory = state.update?.mandatory === true;
  if (state.phase === 'downloading') return mandatory ? null : 'downloading';
  if (fixable(state)) return !mandatory && !deferred ? 'failed' : null;
  if (state.phase === 'ready' && state.installBlocked) return mandatory || !deferred ? 'room-open' : null;
  return null;
}
