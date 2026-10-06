import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { TEAM_NAME_MAX_LENGTH } from '@monopoly/shared';

interface TeamNameFieldProps {
  name: string;
  busy: boolean;
  onCommit: (name: string) => void;
}

/**
 * The host's team name editor: a plain text field that saves on Enter or when it loses focus, and puts the old name back on
 * Escape or when left empty. The name is limited to the same length as a player name; the server trims and sanitises it again.
 */
export default function TeamNameField({ name, busy, onCommit }: TeamNameFieldProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(name);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(name);
  }, [focused, name]);

  const commit = (): void => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(name);
      return;
    }
    if (trimmed !== name) onCommit(trimmed);
    setDraft(trimmed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(name);
      event.currentTarget.blur();
    }
  };

  return (
    <div className="lobby-team__name-field">
      <label htmlFor={inputId} className="sr-only">Tên đội</label>
      <input
        id={inputId}
        className="lobby-team__name-input"
        type="text"
        value={draft}
        maxLength={TEAM_NAME_MAX_LENGTH}
        disabled={busy}
        autoComplete="off"
        onChange={event => setDraft(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
