import type { GameState } from '@monopoly/shared';

// Current time (HH:MM:SS) for log lines.
export const date = (): string => new Date(Date.now()).toLocaleTimeString('en-GB', { hour12: false });

// Escape HTML so user-supplied text (chat) can't inject markup/scripts.
export const escapeHtml = (value: unknown): string => (typeof value === 'string' ? value : '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

// Sanitise a player name: strip markup-significant characters, trim, cap length.
export const sanitizeName = (value: unknown): string => (typeof value === 'string' ? value : '')
  .replace(/[<>&"']/g, '')
  .trim()
  .slice(0, 20);

// Append a message to a room's game log.
export const sendToLog = (state: GameState, text: string): void => {
  state.boardState.logs = [...state.boardState.logs, `${date()} - ${text}`];
};
